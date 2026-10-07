import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "@curiouslycory/db";
import type * as schema from "@curiouslycory/db/schema";
import { apiTokens, user } from "@curiouslycory/db/schema";

vi.mock("@curiouslycory/db/client", () => ({ db: {} }));
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

const { createTestCaller } = await import("../../test-utils");
const { resolveTokenSession, TOKEN_PREFIX } = await import(
  "../../lib/token-auth"
);

type Caller = Awaited<ReturnType<typeof createTestCaller>>["caller"];

/**
 * Personal access token router + Bearer resolution (#22). Tokens are shown once
 * at creation; only a SHA-256 hash + 8-char prefix persist. Every read/write is
 * scoped to the calling user (#21), and Bearer resolution yields the same session
 * shape a cookie session does.
 */
describe("token router", () => {
  let db: BetterSQLite3Database<typeof schema>;
  let rawDb: Database.Database;
  let repoPath: string;
  let userA: Caller;
  let callerFor: Awaited<ReturnType<typeof createTestCaller>>["callerFor"];

  async function seedUser(id: string) {
    await db.insert(user).values({
      id,
      name: id,
      email: `${id}@example.com`,
    });
  }

  const bearer = (token: string) => `Bearer ${token}`;

  beforeEach(async () => {
    const ctx = await createTestCaller();
    db = ctx.db;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
    callerFor = ctx.callerFor;
    userA = ctx.callerFor({ id: "user-a" });
    await seedUser("user-a");
    await seedUser("user-b");
  });

  afterEach(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("create", () => {
    it("returns the full token once and persists only the hash", async () => {
      const result = await userA.token.create({ name: "cli" });

      expect(result.token.startsWith(TOKEN_PREFIX)).toBe(true);
      expect(result.tokenPrefix).toBe(result.token.slice(0, 8));

      const rows = await db.select().from(apiTokens);
      expect(rows).toHaveLength(1);
      const [row] = rows;
      // Only the hash is stored, never the plaintext.
      expect(row?.tokenHash).toBe(
        createHash("sha256").update(result.token).digest("hex"),
      );
      expect(row?.tokenHash).not.toBe(result.token);
      expect(JSON.stringify(row)).not.toContain(result.token);
    });
  });

  describe("list", () => {
    it("exposes prefix + lastUsed but never the secret or hash", async () => {
      const created = await userA.token.create({ name: "ci" });
      const list = await userA.token.list();

      expect(list).toHaveLength(1);
      const [item] = list;
      expect(item?.tokenPrefix).toBe(created.tokenPrefix);
      expect(item?.lastUsedAt).toBeNull();
      expect(item).not.toHaveProperty("tokenHash");
      expect(JSON.stringify(list)).not.toContain(created.token);
    });

    it("is scoped per user", async () => {
      await userA.token.create({ name: "a-token" });
      const userB = callerFor({ id: "user-b" });
      await userB.token.create({ name: "b-token" });

      expect((await userA.token.list()).map((t) => t.name)).toEqual([
        "a-token",
      ]);
      expect((await userB.token.list()).map((t) => t.name)).toEqual([
        "b-token",
      ]);
    });
  });

  describe("revoke", () => {
    it("revokes a token so it no longer authenticates", async () => {
      const created = await userA.token.create({ name: "cli" });

      // Valid before revoke.
      expect(
        (await resolveTokenSession(db, bearer(created.token)))?.user.id,
      ).toBe("user-a");

      await userA.token.revoke({ id: created.id });

      expect(await userA.token.list()).toHaveLength(0);
      // A revoked token no longer resolves.
      expect(await resolveTokenSession(db, bearer(created.token))).toBeNull();
    });

    it("cannot revoke another user's token", async () => {
      const userB = callerFor({ id: "user-b" });
      const bToken = await userB.token.create({ name: "b-token" });

      await expect(userA.token.revoke({ id: bToken.id })).rejects.toMatchObject(
        { code: "NOT_FOUND" },
      );
      // B's token survives.
      expect((await userB.token.list()).map((t) => t.id)).toContain(bToken.id);
    });
  });

  describe("Bearer resolution", () => {
    it("resolves a valid token to the owning user and updates lastUsedAt", async () => {
      const created = await userA.token.create({ name: "cli" });

      const session = await resolveTokenSession(db, bearer(created.token));
      expect(session?.user.id).toBe("user-a");
      expect(session?.user.email).toBe("user-a@example.com");

      const [row] = await db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, created.id));
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
    });

    it("per-user scoping holds: a token for user A authenticates only as A", async () => {
      const aToken = await userA.token.create({ name: "a" });
      const session = await resolveTokenSession(db, bearer(aToken.token));
      // The resolved session is A, never B, so all #21 scoping keys off A's id.
      expect(session?.user.id).toBe("user-a");
      expect(session?.user.id).not.toBe("user-b");
    });

    it("rejects an invalid token", async () => {
      await userA.token.create({ name: "cli" });
      expect(
        await resolveTokenSession(db, bearer("mysk_not-a-real-token")),
      ).toBeNull();
    });

    it("rejects a garbage / wrong-length credential without throwing", async () => {
      expect(await resolveTokenSession(db, bearer("mysk_x"))).toBeNull();
      expect(await resolveTokenSession(db, "not-bearer")).toBeNull();
      expect(await resolveTokenSession(db, null)).toBeNull();
    });

    it("rejects an expired token", async () => {
      const created = await userA.token.create({
        name: "expiring",
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await resolveTokenSession(db, bearer(created.token))).toBeNull();
    });
  });
});
