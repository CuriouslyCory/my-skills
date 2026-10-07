import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { and, eq } from "@curiouslycory/db";
import type * as schema from "@curiouslycory/db/schema";
import { skills } from "@curiouslycory/db/schema";

import type { PublishOctokit } from "../../lib/publish";
import { hashContent } from "../../lib/publish";

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

/**
 * A small in-memory GitHub implementing the calls `publishTree` makes. Repos are
 * keyed by name and start missing; trees are content-addressed like real git
 * (identical content -> identical SHA), and deleting a path that is not in the
 * base tree fails with 422 just as GitHub does.
 */
function makeFakeGithub() {
  type Visibility = "public" | "private";
  const repoStore = new Map<string, { visibility: Visibility; head: string }>();
  const commitTrees = new Map<string, string>();
  // tree SHA -> (path -> blob SHA) for every root tree ever stored.
  const treeFiles = new Map<string, Map<string, string>>();
  let commitCount = 0;

  const storeTree = (files: Map<string, string>) => {
    const sha = `tree-${hashContent(JSON.stringify([...files].sort()))}`;
    treeFiles.set(sha, files);
    return sha;
  };
  const storeCommit = (treeSha: string) => {
    const sha = `commit-${++commitCount}`;
    commitTrees.set(sha, treeSha);
    return sha;
  };
  const requireRepo = (name: string) => {
    const found = repoStore.get(name);
    if (!found) throw new Error(`fake github: unknown repo ${name}`);
    return found;
  };
  const headFiles = (name: string) => {
    const treeSha = commitTrees.get(requireRepo(name).head) ?? "";
    return new Map(treeFiles.get(treeSha));
  };
  /** Seeds (or commits files straight into) a repo, as a user would on GitHub. */
  const commitDirectly = (
    name: string,
    files: Record<string, string>,
    visibility: Visibility = "public",
  ) => {
    const next = repoStore.has(name)
      ? headFiles(name)
      : new Map<string, string>();
    for (const [path, content] of Object.entries(files)) {
      next.set(path, `blob-${hashContent(content).slice(0, 12)}`);
    }
    const head = storeCommit(storeTree(next));
    repoStore.set(name, {
      visibility: repoStore.get(name)?.visibility ?? visibility,
      head,
    });
  };

  /** Removes files straight from a repo's branch, as a user would on GitHub. */
  const deleteDirectly = (name: string, paths: string[]) => {
    const next = headFiles(name);
    for (const path of paths) next.delete(path);
    requireRepo(name).head = storeCommit(storeTree(next));
  };

  const repos = {
    get: vi.fn(({ repo }: { repo: string }) => {
      const found = repoStore.get(repo);
      if (!found) {
        return Promise.reject(
          Object.assign(new Error("Not Found"), { status: 404 }),
        );
      }
      return Promise.resolve({
        data: {
          default_branch: "main",
          html_url: `https://github.com/alice/${repo}`,
          private: found.visibility === "private",
          visibility: found.visibility,
        },
      });
    }),
    createForAuthenticatedUser: vi.fn(
      ({ name, private: isPrivate }: { name: string; private: boolean }) => {
        // auto_init: an initial commit holding a README.
        commitDirectly(
          name,
          { "README.md": `# ${name}\n` },
          isPrivate ? "private" : "public",
        );
        return Promise.resolve({
          data: {
            default_branch: "main",
            html_url: `https://github.com/alice/${name}`,
          },
        });
      },
    ),
  };

  const git = {
    getRef: vi.fn(({ repo }: { repo: string }) =>
      Promise.resolve({ data: { object: { sha: requireRepo(repo).head } } }),
    ),
    getCommit: vi.fn(({ commit_sha }: { commit_sha: string }) =>
      Promise.resolve({ data: { tree: { sha: commitTrees.get(commit_sha) } } }),
    ),
    // Subtree SHAs are `<root tree sha>:<dir prefix>/`.
    getTree: vi.fn(({ tree_sha }: { tree_sha: string }) => {
      const [rootSha = "", prefix = ""] = tree_sha.split(":");
      const entries = new Map<
        string,
        { path: string; type: string; sha: string }
      >();
      for (const [path, blobSha] of treeFiles.get(rootSha) ?? []) {
        if (!path.startsWith(prefix)) continue;
        const [first = "", ...rest] = path.slice(prefix.length).split("/");
        entries.set(
          first,
          rest.length > 0
            ? {
                path: first,
                type: "tree",
                sha: `${rootSha}:${prefix}${first}/`,
              }
            : { path: first, type: "blob", sha: blobSha },
        );
      }
      return Promise.resolve({ data: { tree: [...entries.values()] } });
    }),
    createBlob: vi.fn(({ content }: { content: string }) =>
      Promise.resolve({
        data: { sha: `blob-${hashContent(content).slice(0, 12)}` },
      }),
    ),
    createTree: vi.fn(
      ({
        base_tree,
        tree,
      }: {
        base_tree?: string;
        tree: { path: string; sha: string | null }[];
      }) => {
        const next = new Map(base_tree ? treeFiles.get(base_tree) : undefined);
        for (const entry of tree) {
          if (entry.sha !== null) {
            next.set(entry.path, entry.sha);
          } else if (!next.delete(entry.path)) {
            return Promise.reject(
              Object.assign(new Error("GitRPC::BadObjectState"), {
                status: 422,
              }),
            );
          }
        }
        return Promise.resolve({ data: { sha: storeTree(next) } });
      },
    ),
    createCommit: vi.fn(({ tree }: { tree: string }) =>
      Promise.resolve({ data: { sha: storeCommit(tree) } }),
    ),
    updateRef: vi.fn(({ repo, sha }: { repo: string; sha: string }) => {
      requireRepo(repo).head = sha;
      return Promise.resolve({ data: {} });
    }),
  };

  const octokit = { rest: { repos, git } } as unknown as PublishOctokit;
  /** Sorted paths currently on the repo's default branch. */
  const pathsIn = (name: string) => [...headFiles(name).keys()].sort();
  return { octokit, git, repos, commitDirectly, deleteDirectly, pathsIn };
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

      const fake = makeFakeGithub();
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
      expect(first.commitSha).toBe("commit-2"); // commit-1 is the auto_init README
      expect(fake.repos.createForAuthenticatedUser).toHaveBeenCalledTimes(1);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1);

      // Status now reports published.
      const status = await userA.publish.status();
      expect(status.lastCommitSha).toBe("commit-2");
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

      const fake = makeFakeGithub();
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

  describe("destination changes and existing repos", () => {
    function connect(fake: ReturnType<typeof makeFakeGithub>) {
      vi.mocked(getAuthenticatedGithubClient).mockResolvedValue({
        octokit: fake.octokit as never,
        login: "alice",
        scopes: ["repo"],
      });
    }

    it("publishes to a newly configured repo even when the content is unchanged", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      const fake = makeFakeGithub();
      connect(fake);

      await userA.publish.configure({
        repoName: "repo-a",
        visibility: "public",
        selection: ["alpha"],
      });
      const first = await userA.publish.run();
      expect(first.committed).toBe(true);

      await userA.publish.configure({
        repoName: "repo-b",
        visibility: "public",
        selection: ["alpha"],
      });
      const status = await userA.publish.status();
      expect(status.lastCommitSha).toBe(null);
      expect(status.artifacts.find((a) => a.name === "alpha")?.state).toBe(
        "pending",
      );

      const second = await userA.publish.run();
      expect(second.committed).toBe(true);
      expect(second.url).toBe("https://github.com/alice/repo-b");
      expect(second.commitSha).not.toBe(first.commitSha);
      expect(fake.repos.createForAuthenticatedUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "repo-b" }),
      );
      expect(fake.pathsIn("repo-b")).toEqual(["README.md", "alpha/SKILL.md"]);
    });

    it("keeps publication state when only the repo name's case changes", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      const fake = makeFakeGithub();
      connect(fake);

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });
      await userA.publish.run();
      await userA.publish.configure({
        repoName: "My-Skills",
        visibility: "public",
        selection: ["alpha"],
      });

      const rerun = await userA.publish.run();
      expect(rerun.unchanged).toBe(true);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1);
    });

    it("re-checks the repo on a visibility change and refuses a mismatch before uploading", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      const fake = makeFakeGithub();
      connect(fake);

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });
      await userA.publish.run();
      const blobsBefore = fake.git.createBlob.mock.calls.length;

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "private",
        selection: ["alpha"],
      });
      // Same content, but the run must not short-circuit as "Already up to date".
      await expect(userA.publish.run()).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("is public") as unknown,
      });
      expect(fake.git.createBlob.mock.calls.length).toBe(blobsBefore);
      expect(fake.git.createCommit).toHaveBeenCalledTimes(1);
    });

    it("preserves unrelated files on the first publish to an existing repo", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      const fake = makeFakeGithub();
      connect(fake);
      fake.commitDirectly("existing", {
        "README.md": "# My project\n",
        LICENSE: "MIT\n",
        "src/index.ts": "export {};\n",
        ".github/workflows/ci.yml": "on: push\n",
      });

      await userA.publish.configure({
        repoName: "existing",
        visibility: "public",
        selection: ["alpha"],
      });
      const result = await userA.publish.run();

      expect(result.committed).toBe(true);
      expect(fake.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
      expect(fake.pathsIn("existing")).toEqual([
        ".github/workflows/ci.yml",
        "LICENSE",
        "README.md",
        "alpha/SKILL.md",
        "src/index.ts",
      ]);
    });

    it("removes only the de-selected artifact's SKILL.md on re-publish", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await addSkill({ userId: "user-a", name: "beta", content: "b\n" });
      const fake = makeFakeGithub();
      connect(fake);

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha", "beta"],
      });
      await userA.publish.run();
      // The user adds their own files on GitHub, one inside a managed skill dir.
      fake.commitDirectly("my-skills", {
        LICENSE: "MIT\n",
        "beta/notes.md": "my notes\n",
      });

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });
      const rerun = await userA.publish.run();

      expect(rerun.committed).toBe(true);
      expect(fake.pathsIn("my-skills")).toEqual([
        "LICENSE",
        "README.md",
        "alpha/SKILL.md",
        "beta/notes.md",
      ]);
    });

    it("tolerates a previously published SKILL.md already deleted on GitHub", async () => {
      await addSkill({ userId: "user-a", name: "alpha", content: "a\n" });
      await addSkill({ userId: "user-a", name: "beta", content: "b\n" });
      const fake = makeFakeGithub();
      connect(fake);

      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha", "beta"],
      });
      await userA.publish.run();
      // The user deletes beta by hand on GitHub, then de-selects it here.
      fake.deleteDirectly("my-skills", ["beta/SKILL.md"]);
      await userA.publish.configure({
        repoName: "my-skills",
        visibility: "public",
        selection: ["alpha"],
      });

      // Deleting the missing path would 422; the run succeeds without a commit
      // because the repo already matches the desired content.
      const rerun = await userA.publish.run();
      expect(rerun.committed).toBe(false);
      expect(rerun.unchanged).toBe(true);
      expect(fake.pathsIn("my-skills")).toEqual([
        "README.md",
        "alpha/SKILL.md",
      ]);
      const status = await userA.publish.status();
      expect(status.lastCommitSha).toBe(rerun.commitSha);
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
