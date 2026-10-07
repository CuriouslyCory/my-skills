import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as schema from "@curiouslycory/db/schema";
import { account } from "@curiouslycory/db/schema";

vi.mock("@curiouslycory/db/client", () => ({ db: {} }));
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

const { createTestCaller } = await import("../../test-utils");

type Caller = Awaited<ReturnType<typeof createTestCaller>>["caller"];

/**
 * GitHub connector router (#28). Connector state is the reused better-auth
 * `account` row; every read/write is scoped by the calling user's id.
 */
describe("github router", () => {
  let db: BetterSQLite3Database<typeof schema>;
  let rawDb: Database.Database;
  let repoPath: string;
  let userA: Caller;
  let callerFor: Awaited<ReturnType<typeof createTestCaller>>["callerFor"];

  beforeEach(async () => {
    const ctx = await createTestCaller();
    db = ctx.db;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
    callerFor = ctx.callerFor;
    userA = ctx.callerFor({ id: "user-a" });
  });

  afterEach(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function linkGithub(opts: {
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

  describe("status", () => {
    it("reports not connected when there is no github account", async () => {
      const status = await userA.github.status();
      expect(status).toEqual({
        connected: false,
        hasGithubLogin: false,
        scopes: [],
      });
    });

    it("reports login-only (no repo scope) as not connected", async () => {
      await linkGithub({
        userId: "user-a",
        accessToken: "tok",
        scope: "read:user user:email",
      });
      const status = await userA.github.status();
      expect(status.connected).toBe(false);
      expect(status.hasGithubLogin).toBe(true);
      expect(status.scopes).not.toContain("repo");
    });

    it("reports connected once repo scope is granted", async () => {
      await linkGithub({
        userId: "user-a",
        accessToken: "tok",
        scope: "read:user user:email repo",
      });
      const status = await userA.github.status();
      expect(status.connected).toBe(true);
      expect(status.scopes).toContain("repo");
    });

    it("is scoped per user (no cross-user leakage)", async () => {
      await linkGithub({
        userId: "user-b",
        accessToken: "tok",
        scope: "repo",
      });
      // user-a has no account even though user-b is connected.
      expect((await userA.github.status()).connected).toBe(false);
      const userB = callerFor({ id: "user-b" });
      expect((await userB.github.status()).connected).toBe(true);
    });
  });

  describe("verifyConnection error mapping", () => {
    it("maps not connected to a FORBIDDEN error", async () => {
      await expect(userA.github.verifyConnection()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("maps missing repo scope to a FORBIDDEN error", async () => {
      await linkGithub({
        userId: "user-a",
        accessToken: "tok",
        scope: "read:user",
      });
      await expect(userA.github.verifyConnection()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("disconnect", () => {
    it("forgets the stored token and scopes for the calling user", async () => {
      await linkGithub({
        userId: "user-a",
        accessToken: "tok",
        scope: "repo",
      });
      expect((await userA.github.status()).connected).toBe(true);

      const result = await userA.github.disconnect();
      expect(result.success).toBe(true);

      const status = await userA.github.status();
      expect(status.connected).toBe(false);
      // Row is kept (github login still works), just token/scope cleared.
      expect(status.hasGithubLogin).toBe(true);
      expect(status.scopes).toEqual([]);
    });

    it("cannot disconnect another user's connector", async () => {
      await linkGithub({
        userId: "user-b",
        accessToken: "tok",
        scope: "repo",
      });
      // user-a disconnects; user-b must be untouched.
      await userA.github.disconnect();
      const userB = callerFor({ id: "user-b" });
      expect((await userB.github.status()).connected).toBe(true);
    });
  });
});
