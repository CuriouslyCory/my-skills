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
  commitParents: string[];
  commitTree: string;
  updateRef: { ref: string; sha: string } | null;
}

/** A fake octokit that records Git Data API calls for assertions. */
function makeFakeOctokit(opts: { repoExists: boolean }) {
  const recorded: RecordedCalls = {
    treePaths: [],
    treeModes: [],
    treeTypes: [],
    commitParents: [],
    commitTree: "",
    updateRef: null,
  };
  const repos = {
    get: vi.fn(() =>
      opts.repoExists
        ? Promise.resolve({
            data: {
              default_branch: "main",
              html_url: "https://github.com/octocat/my-skills",
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
    createBlob: vi.fn(({ content }: { content: string }) =>
      Promise.resolve({ data: { sha: `blob-${hashContent(content).slice(0, 8)}` } }),
    ),
    createTree: vi.fn(
      (args: {
        tree: { path: string; mode: string; type: string }[];
      }) => {
        recorded.treePaths = args.tree.map((t) => t.path);
        recorded.treeModes = args.tree.map((t) => t.mode);
        recorded.treeTypes = args.tree.map((t) => t.type);
        return Promise.resolve({ data: { sha: "tree-sha" } });
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
    });
  });

  it("does not create the repo when it already exists", async () => {
    const { octokit, repos, git } = makeFakeOctokit({ repoExists: true });
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
});
