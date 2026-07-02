import { createHash } from "node:crypto";

import type { Octokit } from "octokit";

import { buildSkillContent } from "@curiouslycory/shared-types";
import type { SkillFrontmatter } from "@curiouslycory/shared-types";

/**
 * Library publishing lib (#29).
 *
 * Renders a user's personal artifacts into an agentskills.io-compatible repo
 * layout and commits them to GitHub via octokit's Git Data API (blobs -> tree ->
 * commit -> ref). No filesystem is touched, so publishing works on serverless
 * infra (Vercel). The pure helpers here (render/hash/diff/message) are decoupled
 * from octokit so they can be unit-tested without live GitHub; `publishTree`
 * wraps the Git Data API calls behind a minimal, mockable client surface.
 */

/** One artifact the caller wants published (the fields we render into SKILL.md). */
export interface PublishArtifact {
  name: string;
  description: string;
  content: string;
  author?: string | null;
  version?: string | null;
}

/** A single file to write into the repo tree. */
export interface RenderedFile {
  /** Repo-relative path, e.g. `my-skill/SKILL.md`. */
  path: string;
  content: string;
}

/**
 * Renders an artifact to a `<name>/SKILL.md` file whose frontmatter is produced by
 * `buildSkillContent`. This mirrors the CLI's own `materializeCloudArtifact` so a
 * published repo is byte-identical to what the CLI would materialize locally, and
 * the resulting layout (a skill directory holding SKILL.md at repo root) is exactly
 * what `discoverSkills` walks for, making the repo installable via `ms add owner/repo`.
 */
export function renderArtifactSkill(artifact: PublishArtifact): RenderedFile {
  // Assigning through a const typed as SkillFrontmatter (via spread, which bypasses
  // excess-property checks) mirrors the API/CLI write path for author/version.
  const frontmatter: SkillFrontmatter = {
    name: artifact.name,
    description: artifact.description,
    ...(artifact.author ? { author: artifact.author } : {}),
    ...(artifact.version ? { version: artifact.version } : {}),
  };
  return {
    path: `${artifact.name}/SKILL.md`,
    content: buildSkillContent(frontmatter, artifact.content),
  };
}

/** Renders every artifact to its repo file. */
export function renderArtifacts(artifacts: PublishArtifact[]): RenderedFile[] {
  return artifacts.map(renderArtifactSkill);
}

/** SHA-256 (hex) of a rendered file's content, used as the idempotency key. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** A per-artifact content-hash map: `{ [artifactName]: sha256hex }`. */
export type ArtifactState = Record<string, string>;

/** Builds the desired hash map from a selection of artifacts. */
export function computeArtifactState(
  artifacts: PublishArtifact[],
): ArtifactState {
  const state: ArtifactState = {};
  for (const artifact of artifacts) {
    state[artifact.name] = hashContent(renderArtifactSkill(artifact).content);
  }
  return state;
}

/** Structured diff between the last-published state and the desired state. */
export interface PublishDiff {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
  /** True when any artifact was added, updated, or removed. */
  changed: boolean;
}

/**
 * Diffs the desired artifact hashes against the last-published map. This is the
 * heart of idempotency: a re-publish only commits when `changed` is true.
 */
export function diffPublish(
  previous: ArtifactState,
  desired: ArtifactState,
): PublishDiff {
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const [name, hash] of Object.entries(desired)) {
    if (!(name in previous)) {
      added.push(name);
    } else if (previous[name] !== hash) {
      updated.push(name);
    } else {
      unchanged.push(name);
    }
  }

  const removed = Object.keys(previous).filter((name) => !(name in desired));

  return {
    added: added.sort(),
    updated: updated.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
    changed: added.length > 0 || updated.length > 0 || removed.length > 0,
  };
}

/** Builds a concise, human-readable commit message from a diff. */
export function buildCommitMessage(diff: PublishDiff): string {
  const total = diff.added.length + diff.updated.length + diff.unchanged.length;
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.length} added`);
  if (diff.updated.length > 0) parts.push(`~${diff.updated.length} updated`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length} removed`);
  const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `Publish ${total} skill${total === 1 ? "" : "s"}${summary}`;
}

/** The result of a successful tree commit. */
export interface PublishTreeResult {
  commitSha: string;
  branch: string;
  htmlUrl: string;
}

/**
 * The narrow slice of octokit the publish flow depends on. Declared structurally
 * so tests can supply a lightweight fake without constructing a real Octokit.
 */
export type PublishOctokit = Pick<Octokit, "rest">;

/**
 * Ensures the repo exists (creating a public/private repo with an initial commit
 * when missing) and commits the rendered files as a single tree via the Git Data
 * API: blobs -> tree -> commit -> ref update. The tree is built from scratch (no
 * `base_tree`), so the repo content is exactly the desired set and de-selected
 * artifacts are dropped. Returns the new commit SHA, branch, and repo URL.
 */
export async function publishTree(
  octokit: PublishOctokit,
  opts: {
    owner: string;
    repo: string;
    isPrivate: boolean;
    files: RenderedFile[];
    message: string;
  },
): Promise<PublishTreeResult> {
  const { owner, repo, isPrivate, files, message } = opts;

  // 1. Create the repo if it does not exist yet. `auto_init` gives us a base
  //    branch + initial commit so a ref exists to build the next commit on.
  let defaultBranch: string;
  let htmlUrl: string;
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    defaultBranch = data.default_branch;
    htmlUrl = data.html_url;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repo,
      private: isPrivate,
      auto_init: true,
      description: "Skills published with my-skills",
    });
    defaultBranch = data.default_branch;
    htmlUrl = data.html_url;
  }

  const ref = `heads/${defaultBranch}`;

  // 2. Resolve the current branch head (the parent of our new commit).
  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref });
  const baseCommitSha = refData.object.sha;

  // 3. Blob per file.
  const tree = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  // 4. Full tree (no base_tree -> exact desired content).
  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree,
  });

  // 5. Commit pointing at the new tree with the current head as parent.
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: treeData.sha,
    parents: [baseCommitSha],
  });

  // 6. Fast-forward the branch to the new commit.
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref,
    sha: commit.sha,
  });

  return { commitSha: commit.sha, branch: defaultBranch, htmlUrl };
}

/** Narrows an unknown thrown value to an HTTP 404 (Octokit RequestError). */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 404
  );
}
