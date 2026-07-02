import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Octokit } from "octokit";

import type * as schema from "@curiouslycory/db/schema";
import { account } from "@curiouslycory/db/schema";

// Prevent real SQLite initialization at import time (mirrors scoping.test.ts).
vi.mock("@curiouslycory/db/client", () => ({ db: {} }));
vi.mock("../config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

const { createTestCaller } = await import("../../test-utils");
const {
  GithubConnectorError,
  assertGithubTokenValid,
  getAuthenticatedGithubClient,
  parseScopes,
  resolveGithubConnection,
} = await import("../github-connector");

/** Builds a fake Octokit whose `getAuthenticated` behaves as configured. */
function mockOctokit(
  behavior:
    | { kind: "ok"; login: string }
    | { kind: "status"; status: number },
): Octokit {
  return {
    rest: {
      users: {
        getAuthenticated: () => {
          if (behavior.kind === "ok") {
            return Promise.resolve({ data: { login: behavior.login } });
          }
          return Promise.reject(
            Object.assign(new Error("HTTP error"), { status: behavior.status }),
          );
        },
      },
    },
  } as unknown as Octokit;
}

describe("github-connector lib", () => {
  let db: BetterSQLite3Database<typeof schema>;
  let rawDb: Database.Database;
  let repoPath: string;

  beforeEach(async () => {
    const ctx = await createTestCaller();
    db = ctx.db;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
  });

  afterEach(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function insertGithubAccount(opts: {
    userId: string;
    accessToken?: string | null;
    scope?: string | null;
  }) {
    await db.insert(account).values({
      accountId: `gh-${opts.userId}`,
      providerId: "github",
      userId: opts.userId,
      accessToken: opts.accessToken ?? null,
      scope: opts.scope ?? null,
    });
  }

  describe("parseScopes", () => {
    it("splits space- and comma-separated scopes and ignores blanks", () => {
      expect(parseScopes("read:user user:email repo")).toEqual([
        "read:user",
        "user:email",
        "repo",
      ]);
      expect(parseScopes("read:user,repo")).toEqual(["read:user", "repo"]);
      expect(parseScopes(null)).toEqual([]);
      expect(parseScopes("")).toEqual([]);
    });
  });

  describe("resolveGithubConnection", () => {
    it("throws not_connected when there is no github account", async () => {
      await expect(resolveGithubConnection(db, "user-none")).rejects.toMatchObject(
        { reason: "not_connected" },
      );
    });

    it("throws not_connected when linked but no stored token (post-disconnect)", async () => {
      await insertGithubAccount({
        userId: "user-x",
        accessToken: null,
        scope: "repo",
      });
      await expect(resolveGithubConnection(db, "user-x")).rejects.toBeInstanceOf(
        GithubConnectorError,
      );
      await expect(
        resolveGithubConnection(db, "user-x"),
      ).rejects.toMatchObject({ reason: "not_connected" });
    });

    it("throws missing_scope when repo scope was not granted (base sign-in only)", async () => {
      await insertGithubAccount({
        userId: "user-base",
        accessToken: "tok",
        scope: "read:user user:email",
      });
      await expect(
        resolveGithubConnection(db, "user-base"),
      ).rejects.toMatchObject({ reason: "missing_scope" });
    });

    it("resolves token and scopes when repo scope is present", async () => {
      await insertGithubAccount({
        userId: "user-ok",
        accessToken: "tok-123",
        scope: "read:user user:email repo",
      });
      const conn = await resolveGithubConnection(db, "user-ok");
      expect(conn.accessToken).toBe("tok-123");
      expect(conn.scopes).toContain("repo");
    });
  });

  describe("assertGithubTokenValid", () => {
    it("returns the login when GitHub accepts the token", async () => {
      const result = await assertGithubTokenValid(
        mockOctokit({ kind: "ok", login: "octocat" }),
      );
      expect(result.login).toBe("octocat");
    });

    it("throws token_revoked on a 401 from GitHub", async () => {
      await expect(
        assertGithubTokenValid(mockOctokit({ kind: "status", status: 401 })),
      ).rejects.toMatchObject({ reason: "token_revoked" });
    });

    it("rethrows non-401 errors unchanged", async () => {
      await expect(
        assertGithubTokenValid(mockOctokit({ kind: "status", status: 500 })),
      ).rejects.not.toBeInstanceOf(GithubConnectorError);
    });
  });

  describe("getAuthenticatedGithubClient", () => {
    it("resolves, builds and verifies a client for a connected user", async () => {
      await insertGithubAccount({
        userId: "user-live",
        accessToken: "tok-live",
        scope: "repo",
      });
      const { login, scopes } = await getAuthenticatedGithubClient(
        db,
        "user-live",
        { createOctokit: () => mockOctokit({ kind: "ok", login: "live-user" }) },
      );
      expect(login).toBe("live-user");
      expect(scopes).toContain("repo");
    });

    it("surfaces token_revoked when the stored token is rejected by GitHub", async () => {
      await insertGithubAccount({
        userId: "user-revoked",
        accessToken: "tok-dead",
        scope: "repo",
      });
      await expect(
        getAuthenticatedGithubClient(db, "user-revoked", {
          createOctokit: () => mockOctokit({ kind: "status", status: 401 }),
        }),
      ).rejects.toMatchObject({ reason: "token_revoked" });
    });
  });
});
