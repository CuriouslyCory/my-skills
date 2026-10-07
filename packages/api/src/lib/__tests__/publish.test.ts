import { describe, expect, it, vi } from "vitest";

import {
  buildSkillContent,
  parseSkillFrontmatter,
} from "@curiouslycory/shared-types";
import type { SkillFrontmatter } from "@curiouslycory/shared-types";

import type { PublishArtifact, PublishOctokit } from "../publish";
import {
  buildCommitMessage,
  computeArtifactState,
  diffPublish,
  hashContent,
  PublishVisibilityError,
  publishTree,
  renderArtifactSkill,
  renderArtifacts,
} from "../publish";

const skillArtifact: PublishArtifact = {
  name: "code-review",
  description: "Review code for correctness and clarity",
  content: "# Code Review\n\nDo the review carefully.\n",
  author: "alice",
  version: "1.2.0",
};

describe("renderArtifactSkill", () => {
  it("renders a <name>/SKILL.md path", () => {
    const file = renderArtifactSkill(skillArtifact);
    expect(file.path).toBe("code-review/SKILL.md");
  });

  it("produces frontmatter that round-trips through parseSkillFrontmatter losslessly", () => {
    // Round-trip the fields discoverSkills consumes (name + description) and body.
    const file = renderArtifactSkill(skillArtifact);
    const { frontmatter, body } = parseSkillFrontmatter(file.content);
    expect(frontmatter.name).toBe(skillArtifact.name);
    expect(frontmatter.description).toBe(skillArtifact.description);
    expect(body.trim()).toBe(skillArtifact.content.trim());
  });

  it("is byte-identical to buildSkillContent (matches the CLI materialize path)", () => {
    const file = renderArtifactSkill(skillArtifact);
    // Spread (not direct props) mirrors the impl and bypasses excess-property checks.
    const frontmatter: SkillFrontmatter = {
      name: skillArtifact.name,
      description: skillArtifact.description,
      ...(skillArtifact.author ? { author: skillArtifact.author } : {}),
      ...(skillArtifact.version ? { version: skillArtifact.version } : {}),
    };
    const expected = buildSkillContent(frontmatter, skillArtifact.content);
    expect(file.content).toBe(expected);
  });
});

describe("discoverSkills compatibility", () => {
  // Mirrors the exact rules in apps/cli/src/services/cache.ts discoverSkills:
  // walk the repo, and for any file named SKILL.md, parse its frontmatter and read
  // name + description. Here we assert every rendered file lands at a
  // root-level `<name>/SKILL.md` and parses cleanly, so `ms add owner/repo`
  // (unauthenticated) would discover and install each one.
  it("renders a discoverable, installable tree", () => {
    const artifacts: PublishArtifact[] = [
      skillArtifact,
      {
        name: "commit-writer",
        description: "Write conventional commit messages",
        content: "Write a good commit.\n",
      },
    ];
    const files = renderArtifacts(artifacts);

    const discovered = files
      .filter((file) => file.path.endsWith("/SKILL.md"))
      .map((file) => {
        // SKILL.md must sit exactly one directory deep at the repo root.
        const parts = file.path.split("/");
        expect(parts).toHaveLength(2);
        expect(parts[1]).toBe("SKILL.md");
        const { frontmatter } = parseSkillFrontmatter(file.content);
        return { name: frontmatter.name, description: frontmatter.description };
      });

    expect(discovered).toEqual([
      { name: "code-review", description: skillArtifact.description },
      {
        name: "commit-writer",
        description: "Write conventional commit messages",
      },
    ]);
  });
});

describe("hashing + diff (idempotency primitives)", () => {
  it("hashes deterministically", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });

  it("detects added, updated, removed, and unchanged artifacts", () => {
    const previous = computeArtifactState([skillArtifact]);
    const changedArtifact: PublishArtifact = {
      ...skillArtifact,
      content: "# Code Review\n\nChanged body.\n",
    };
    const added: PublishArtifact = {
      name: "new-one",
      description: "A brand new skill",
      content: "hello\n",
    };
    const desired = computeArtifactState([changedArtifact, added]);

    const diff = diffPublish(previous, desired);
    expect(diff.added).toEqual(["new-one"]);
    expect(diff.updated).toEqual(["code-review"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toBe(true);
  });

  it("reports no change when the desired state equals the previous state", () => {
    const state = computeArtifactState([skillArtifact]);
    const diff = diffPublish(state, computeArtifactState([skillArtifact]));
    expect(diff.changed).toBe(false);
    expect(diff.unchanged).toEqual(["code-review"]);
  });

  it("builds a concise commit message", () => {
    const diff = diffPublish(
      computeArtifactState([skillArtifact]),
      computeArtifactState([
        { name: "new-one", description: "d", content: "x\n" },
      ]),
    );
    const message = buildCommitMessage(diff);
    expect(message).toContain("Publish");
    expect(message).toContain("added");
    expect(message).toContain("removed");
  });
});

interface RecordedCalls {
  treePaths: string[];
  treeModes: string[];
  treeTypes: string[];
  treeShas: (string | null)[];
  baseTree: string | undefined;
  commitParents: string[];
  commitTree: string;
  updateRef: { ref: string; sha: string } | null;
}

interface FakeTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

/** A fake octokit that records Git Data API calls for assertions. */
function makeFakeOctokit(opts: {
  repoExists: boolean;
  visibility?: "public" | "private" | "internal";
  /** Tree listings by SHA; `base-tree-sha` is the head commit's root tree. */
  trees?: Record<string, FakeTreeEntry[]>;
  /** SHA createTree returns; defaults to a tree distinct from the base. */
  createdTreeSha?: string;
}) {
  const recorded: RecordedCalls = {
    treePaths: [],
    treeModes: [],
    treeTypes: [],
    treeShas: [],
    baseTree: undefined,
    commitParents: [],
    commitTree: "",
    updateRef: null,
  };
  const visibility = opts.visibility ?? "public";
  const repos = {
    get: vi.fn(() =>
      opts.repoExists
        ? Promise.resolve({
            data: {
              default_branch: "main",
              html_url: "https://github.com/octocat/my-skills",
              private: visibility !== "public",
              visibility,
            },
          })
        : Promise.reject(
            Object.assign(new Error("Not Found"), { status: 404 }),
          ),
    ),
    createForAuthenticatedUser: vi.fn(({ name }: { name: string }) =>
      Promise.resolve({
        data: {
          default_branch: "main",
          html_url: `https://github.com/octocat/${name}`,
        },
      }),
    ),
  };
  const git = {
    getRef: vi.fn(() =>
      Promise.resolve({ data: { object: { sha: "base-sha" } } }),
    ),
    getCommit: vi.fn(() =>
      Promise.resolve({ data: { tree: { sha: "base-tree-sha" } } }),
    ),
    getTree: vi.fn(({ tree_sha }: { tree_sha: string }) =>
      Promise.resolve({ data: { tree: opts.trees?.[tree_sha] ?? [] } }),
    ),
    createBlob: vi.fn(({ content }: { content: string }) =>
      Promise.resolve({ data: { sha: `blob-${hashContent(content).slice(0, 8)}` } }),
    ),
    createTree: vi.fn(
      (args: {
        base_tree?: string;
        tree: {
          path: string;
          mode: string;
          type: string;
          sha: string | null;
        }[];
      }) => {
        recorded.baseTree = args.base_tree;
        recorded.treePaths = args.tree.map((t) => t.path);
        recorded.treeModes = args.tree.map((t) => t.mode);
        recorded.treeTypes = args.tree.map((t) => t.type);
        recorded.treeShas = args.tree.map((t) => t.sha);
        return Promise.resolve({
          data: { sha: opts.createdTreeSha ?? "tree-sha" },
        });
      },
    ),
    createCommit: vi.fn((args: { parents: string[]; tree: string }) => {
      recorded.commitParents = args.parents;
      recorded.commitTree = args.tree;
      return Promise.resolve({ data: { sha: "commit-sha" } });
    }),
    updateRef: vi.fn((args: { ref: string; sha: string }) => {
      recorded.updateRef = { ref: args.ref, sha: args.sha };
      return Promise.resolve({ data: {} });
    }),
  };
  const octokit = { rest: { repos, git } } as unknown as PublishOctokit;
  return { octokit, repos, git, recorded };
}

describe("publishTree (Git Data API flow)", () => {
  const files = renderArtifacts([
    skillArtifact,
    { name: "commit-writer", description: "d", content: "x\n" },
  ]);

  it("creates the repo when missing, then commits blobs -> tree -> commit -> ref", async () => {
    const { octokit, repos, git, recorded } = makeFakeOctokit({
      repoExists: false,
    });

    const result = await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: false,
      files,
      message: "Publish 2 skills",
    });

    expect(repos.get).toHaveBeenCalledTimes(1);
    expect(repos.createForAuthenticatedUser).toHaveBeenCalledTimes(1);
    expect(repos.createForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "my-skills",
        private: false,
        auto_init: true,
      }),
    );
    expect(git.createBlob).toHaveBeenCalledTimes(files.length);
    expect(git.createTree).toHaveBeenCalledTimes(1);
    expect([...recorded.treePaths].sort()).toEqual([
      "code-review/SKILL.md",
      "commit-writer/SKILL.md",
    ]);
    expect(recorded.treeModes.every((m) => m === "100644")).toBe(true);
    expect(recorded.treeTypes.every((t) => t === "blob")).toBe(true);
    expect(recorded.commitParents).toEqual(["base-sha"]);
    expect(recorded.commitTree).toBe("tree-sha");
    expect(recorded.updateRef).toEqual({ ref: "heads/main", sha: "commit-sha" });
    expect(result).toEqual({
      commitSha: "commit-sha",
      branch: "main",
      htmlUrl: "https://github.com/octocat/my-skills",
      committed: true,
    });
  });

  it("does not create the repo when it already exists", async () => {
    const { octokit, repos, git } = makeFakeOctokit({
      repoExists: true,
      visibility: "private",
    });
    await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: true,
      files,
      message: "Publish 2 skills",
    });
    expect(repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(git.createCommit).toHaveBeenCalledTimes(1);
  });

  it("layers the commit on the head's tree so unrelated files survive", async () => {
    const { octokit, git, recorded } = makeFakeOctokit({
      repoExists: true,
      trees: {
        "base-tree-sha": [
          { path: "README.md", type: "blob", sha: "readme-blob" },
          { path: "LICENSE", type: "blob", sha: "license-blob" },
          { path: "src", type: "tree", sha: "src-tree" },
        ],
      },
    });

    await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: false,
      files,
      message: "Publish 2 skills",
    });

    expect(git.getCommit).toHaveBeenCalledWith(
      expect.objectContaining({ commit_sha: "base-sha" }),
    );
    expect(recorded.baseTree).toBe("base-tree-sha");
    // Only the selected files are written; nothing else is touched or deleted.
    expect([...recorded.treePaths].sort()).toEqual([
      "code-review/SKILL.md",
      "commit-writer/SKILL.md",
    ]);
    expect(recorded.treeShas).not.toContain(null);
    // No removals requested -> no tree listing calls at all.
    expect(git.getTree).not.toHaveBeenCalled();
  });

  it("deletes only previously published paths that still exist", async () => {
    const { octokit, recorded } = makeFakeOctokit({
      repoExists: true,
      trees: {
        "base-tree-sha": [
          { path: "README.md", type: "blob", sha: "readme-blob" },
          { path: "old-skill", type: "tree", sha: "old-skill-tree" },
          { path: "code-review", type: "tree", sha: "code-review-tree" },
        ],
        "old-skill-tree": [
          { path: "SKILL.md", type: "blob", sha: "old-skill-blob" },
          { path: "notes.md", type: "blob", sha: "notes-blob" },
        ],
      },
    });

    await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: false,
      files,
      // `gone-skill` was removed by hand on GitHub; deleting it would 422.
      removePaths: ["old-skill/SKILL.md", "gone-skill/SKILL.md"],
      message: "Publish 2 skills",
    });

    const deleted = recorded.treePaths.filter(
      (_path, index) => recorded.treeShas[index] === null,
    );
    expect(deleted).toEqual(["old-skill/SKILL.md"]);
    // A user's extra file next to the managed SKILL.md is not ours to delete.
    expect(recorded.treePaths).not.toContain("old-skill/notes.md");
    expect(recorded.treePaths).not.toContain("README.md");
  });

  it("never deletes a path it is writing in the same commit", async () => {
    const { octokit, git, recorded } = makeFakeOctokit({ repoExists: true });

    await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: false,
      files,
      removePaths: ["code-review/SKILL.md"],
      message: "Publish 2 skills",
    });

    expect(recorded.treeShas).not.toContain(null);
    expect(git.getTree).not.toHaveBeenCalled();
  });

  it.each([
    { actual: "public", isPrivate: true },
    { actual: "private", isPrivate: false },
    { actual: "internal", isPrivate: true },
  ] as const)(
    "refuses an existing $actual repo when isPrivate=$isPrivate, before uploading anything",
    async ({ actual, isPrivate }) => {
      const { octokit, repos, git } = makeFakeOctokit({
        repoExists: true,
        visibility: actual,
      });

      await expect(
        publishTree(octokit, {
          owner: "octocat",
          repo: "my-skills",
          isPrivate,
          files,
          message: "Publish 2 skills",
        }),
      ).rejects.toBeInstanceOf(PublishVisibilityError);

      expect(repos.createForAuthenticatedUser).not.toHaveBeenCalled();
      expect(git.createBlob).not.toHaveBeenCalled();
      expect(git.createTree).not.toHaveBeenCalled();
      expect(git.createCommit).not.toHaveBeenCalled();
      expect(git.updateRef).not.toHaveBeenCalled();
    },
  );

  it("makes no commit when the resulting tree equals the head's tree", async () => {
    const { octokit, git } = makeFakeOctokit({
      repoExists: true,
      createdTreeSha: "base-tree-sha",
    });

    const result = await publishTree(octokit, {
      owner: "octocat",
      repo: "my-skills",
      isPrivate: false,
      files,
      message: "Publish 2 skills",
    });

    expect(result).toEqual({
      commitSha: "base-sha",
      branch: "main",
      htmlUrl: "https://github.com/octocat/my-skills",
      committed: false,
    });
    expect(git.createCommit).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
  });
});
