import { timingSafeEqual } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractBearerToken,
  generateToken,
  hashToken,
  resolveTokenSession,
  TOKEN_PREFIX,
} from "../token-auth";

// Wrap the real (constant-time) `timingSafeEqual` in a spy so we can assert the
// hash comparison routes through it (rather than `===`) while still delegating
// to the genuine implementation. ESM export namespaces are not configurable, so
// spying requires module mocking rather than `vi.spyOn`.
vi.mock("node:crypto", async (importActual) => {
  const actual = await importActual<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

/**
 * Pure unit coverage for the token primitives (#22): generation entropy/shape,
 * hashing, Bearer parsing, and the constant-time comparison guarantee. The
 * DB-backed `resolveTokenSession` behavior (match / expiry / lastUsedAt / scoping)
 * is covered in `router/__tests__/token.test.ts`.
 */
describe("token-auth primitives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a mysk_ token with an 8-char prefix and matching sha256 hash", () => {
    const { token, tokenHash, tokenPrefix } = generateToken();

    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(tokenPrefix).toBe(token.slice(0, 8));
    // SHA-256 hex is always 64 chars (32 bytes), so timingSafeEqual always
    // compares equal-length buffers.
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it("produces unique tokens across calls (CSPRNG entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(generateToken().token);
    }
    expect(seen.size).toBe(50);
  });

  it("extracts a Bearer mysk_ token and rejects everything else", () => {
    const { token } = generateToken();
    expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
    expect(extractBearerToken(`bearer ${token}`)).toBe(token);
    // Wrong scheme, wrong prefix, or absent -> null.
    expect(extractBearerToken(`Basic ${token}`)).toBeNull();
    expect(extractBearerToken("Bearer ghp_something")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });

  it("compares token hashes with timingSafeEqual over equal-length buffers", async () => {
    const spy = vi.mocked(timingSafeEqual);
    spy.mockClear();

    const { token, tokenHash, tokenPrefix } = generateToken();
    const now = new Date();
    const rows = [
      {
        id: "t1",
        userId: "user-a",
        name: "cli",
        tokenHash,
        tokenPrefix,
        scopes: "[]",
        lastUsedAt: null,
        expiresAt: null,
        createdAt: now,
      },
    ];

    // Minimal db stub exercising the select -> update -> user lookup path. The
    // `where` result is an array (token candidates) that also answers `.limit`
    // (the user lookup) so both select chains resolve from one stub.
    const userRow = {
      id: "user-a",
      name: "A",
      email: "a@example.com",
      image: null,
    };
    const whereResult = Object.assign([...rows], { limit: () => [userRow] });
    const db = {
      select: () => ({ from: () => ({ where: () => whereResult }) }),
      update: () => ({ set: () => ({ where: () => undefined }) }),
    } as never;

    const session = await resolveTokenSession(db, `Bearer ${token}`);
    expect(session?.user.id).toBe("user-a");
    expect(spy).toHaveBeenCalled();
    const [a, b] = spy.mock.calls[0] ?? [];
    expect(a).toBeInstanceOf(Buffer);
    expect(b).toBeInstanceOf(Buffer);
    expect((a as Buffer).length).toBe((b as Buffer).length);
  });
});
