import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { and, eq } from "@curiouslycory/db";
import type * as schema from "@curiouslycory/db/schema";
import { skills } from "@curiouslycory/db/schema";

import type { PublishOctokit } from "../../lib/publish";

vi.mock("@curiouslycory/db/client", () => ({ db: {} }));
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock only the connector entrypoint; keep GithubConnectorError real so the
// router's error mapping is exercised against genuine connector errors.
vi.mock("../../lib/github-connector", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/github-connector")>();
  return { ...actual, getAuthenticatedGithubClient: vi.fn() };
});

const { getAuthenticatedGithubClient, GithubConnectorError } = await import(
  "../../lib/github-connector"
);
const { createTestCaller } = await import("../../test-utils");

type Caller = Awaited<ReturnType<typeof createTestCaller>>["caller"];

/** A fake octokit that records Git Data API calls; the repo starts missing. */
function makeFakeOctokit() {
  const git = {
    getRef: vi.fn(() =>
      Promise.resolve({ data: { object: { sha: "base-sha" } } }),
    ),
    createBlob: vi.fn(() => Promise.resolve({ data: { sha: "blob-sha" } })),
    createTree: vi.fn(() => Promise.resolve({ data: { sha: "tree-sha" } })),
    createCommit: vi.fn(() => Promise.resolve({ data: { sha: "commit-sha" } })),
    updateRef: vi.fn(() => Promise.resolve({ data: {} })),
  };
  const repos = {
    get: vi.fn(() =>
      Promise.reject(Object.assign(new Error("Not Found"), { status: 404 })),
    ),
    createForAuthenticatedUser: vi.fn(({ name }: { name: string }) =>
      Promise.resolve({
        data: {
          default_branch: "main",
          html_url: `https://github.com/alice/${name}`,
        },
      }),
    ),
  };
  const octokit = { rest: { repos, git } } as unknown as PublishOctokit;
  return { octokit, git, repos };
}

describe("publish router", () => {
  let db: BetterSQLite3Database<typeof schema>;
  let rawDb: Database.Database;
  let repoPath: string;
  let callerFor: Awaited<ReturnType<typeof createTestCaller>>["callerFor"];
  let userA: Caller;

  beforeEach(async () => {
    const ctx = await createTestCaller();
    db = ctx.db;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
    callerFor = ctx.callerFor;
    userA = ctx.callerFor({ id: "user-a" });
    vi.mocked(getAuthenticatedGithubClient).mockReset();
  });

  afterEach(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function addSkill(opts: {
    userId: string;
    name: string;
    content: string;
    description?: string;
  }) {
    await db.insert(skills).values({
      userId: opts.userId,
      name: opts.name,
      description: opts.description ?? `desc for ${opts.name}`,
      content: opts.content,
      tags: "[]",
    });
  }

  describe("configure + status", () => {
    it("stores the target and reports per-artifact state", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await addSkill({ userId: "user-a", name: "beta", content: "b\n" });

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });

      const status = await userA.publish.status();
      expect(status.configured).toBe(true);
      expect(status.repoName).toBe("my-skills");
      expect(status.selection).toEqual(["alpha"]);

      const alpha = status.artifacts.find((a) => a.name === "alpha");
      const beta = status.artifacts.find((a) => a.name === "beta");
      expect(alpha?.included).toBe(true);
      expect(alpha?.state).toBe("pending"); // selected but never published
      expect(beta?.included).toBe(false);
      expect(beta?.state).toBe("excluded");
    });

    it("rejects an invalid repo name", async () => {
      await expect(
        userA.publish.configure({
          repoName: "bad name!",
          visibility: "public",
          selection: [],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("run", () => {
    it("errors when nothing is configured", async () => {
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("errors when the selection is empty", async () => {
      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: [],
      });
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("creates the repo and commits the tree, then is idempotent", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });

      const fake = makeFakeOctokit();
      vi.mocked(getAuthenticatedGithubClient).mockResolvedValue({
        octokit: fake.octokit as never,
        login: "alice",
        scopes: ["repo"],
      });

      // First publish -> one commit.
      const first = await userA.publish.run();
      expect(first.committed).toBe(true);
      expect(first.unchanged).toBe(false);
      expect(first.url).toBe("https://github.com/alice/my-skills");
      expect(first.commitSha).toBe("commit-sha");
      expect(fake.repos.createForAuthenticatedUser).toHaveBeenCalledTimes(1);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1);

      // Status now reports published.
      const status = await userA.publish.status();
      expect(status.lastCommitSha).toBe("commit-sha");
      expect(status.url).toBe("https://github.com/alice/my-skills");
      expect(
        status.artifacts.find((a) => a.name === "alpha")?.state,
      ).toBe("published");

      // Second publish with no changes -> NO commit (idempotent).
      const second = await userA.publish.run();
      expect(second.committed).toBe(false);
      expect(second.unchanged).toBe(true);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1); // unchanged
      // getAuthenticatedGithubClient is not even called on the no-op path.
      expect(vi.mocked(getAuthenticatedGithubClient)).toHaveBeenCalledTimes(1);
    });

    it("commits exactly one new commit when an artifact changes", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });

      const fake = makeFakeOctokit();
      vi.mocked(getAuthenticatedGithubClient).mockResolvedValue({
        octokit: fake.octokit as never,
        login: "alice",
        scopes: ["repo"],
      });

      await userA.publish.run();
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1);

      // Change the artifact content.
      await db
        .update(skills)
        .set({ content: "a-changed\n" })
        .where(and(eq(skills.userId, "user-a"), eq(skills.name, "alpha")));

      const status = await userA.publish.status();
      expect(
        status.artifacts.find((a) => a.name === "alpha")?.state,
      ).toBe("changed");

      const rerun = await userA.publish.run();
      expect(rerun.committed).toBe(true);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(2); // exactly one more
    });
  });

  describe("connector error surfaces", () => {
    beforeEach(async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });
    });

    it("maps not-connected to FORBIDDEN", async () => {
      vi.mocked(getAuthenticatedGithubClient).mockRejectedValue(
        new GithubConnectorError("not_connected", "GitHub is not connected."),
      );
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("maps missing repo scope to FORBIDDEN", async () => {
      vi.mocked(getAuthenticatedGithubClient).mockRejectedValue(
        new GithubConnectorError("missing_scope", "The repo scope is missing."),
      );
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("maps a revoked token to UNAUTHORIZED", async () => {
      vi.mocked(getAuthenticatedGithubClient).mockRejectedValue(
        new GithubConnectorError("token_revoked", "Token revoked."),
      );
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  describe("scoping", () => {
    it("does not leak another user's publish target", async () => {
      await addSkill({ userId: "user-b", name: "secret", content: "s\n" });
      const userB = callerFor({ id: "user-b" });
      await userB.publish.configure({
        repoName: "b-repo",
        visibility: "private",
        selection: ["secret"],
      });

      const statusA = await userA.publish.status();
      expect(statusA.configured).toBe(false);
      expect(statusA.repoName).toBe(null);
      expect(statusA.artifacts).toEqual([]);
    });
  });
});
