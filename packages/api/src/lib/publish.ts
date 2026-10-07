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
    path: skillFilePath(artifact.name),
    content: buildSkillContent(frontmatter, artifact.content),
  };
}

/**
 * Repo-relative path of an artifact's published SKILL.md. This is the only path
 * the publish flow ever writes for an artifact, so it is also the only path it
 * may remove when the artifact is de-selected.
 */
export function skillFilePath(name: string): string {
  return `${name}/SKILL.md`;
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

/** The result of a successful publish. */
export interface PublishTreeResult {
  /** The new commit, or the existing head when the tree was already current. */
  commitSha: string;
  branch: string;
  htmlUrl: string;
  /** False when the repo already held exactly this content (no commit made). */
  committed: boolean;
}

/** GitHub repository visibility (`internal` exists on enterprise accounts). */
export type RepoVisibility = "public" | "private" | "internal";

/**
 * Thrown before any content is uploaded when an existing repository's visibility
 * differs from the requested one. Publishing is refused rather than silently
 * flipping visibility: going private -> public would expose everything already
 * in the repo, and public -> private permanently drops stars/watchers and breaks
 * anyone installing from it. Both are repo-level decisions the user makes on
 * GitHub (or by choosing another repo name).
 */
export class PublishVisibilityError extends Error {
  readonly requested: RepoVisibility;
  readonly actual: RepoVisibility;

  constructor(opts: {
    owner: string;
    repo: string;
    requested: RepoVisibility;
    actual: RepoVisibility;
  }) {
    super(
      `Repository ${opts.owner}/${opts.repo} already exists and is ${opts.actual}, but this publish target is set to ${opts.requested}. Change the repository's visibility on GitHub or choose a different repository name.`,
    );
    this.name = "PublishVisibilityError";
    this.requested = opts.requested;
    this.actual = opts.actual;
  }
}

/**
 * The narrow slice of octokit the publish flow depends on. Declared structurally
 * so tests can supply a lightweight fake without constructing a real Octokit.
 */
export type PublishOctokit = Pick<Octokit, "rest">;

/**
 * Ensures the repo exists (creating a public/private repo with an initial commit
 * when missing) and commits the rendered files as a single tree via the Git Data
 * API: blobs -> tree -> commit -> ref update.
 *
 * The new tree is layered on the current head's tree (`base_tree`), so files the
 * service does not manage (README, LICENSE, source, workflows) are preserved.
 * Only `removePaths` (artifacts this service previously published that are no
 * longer selected) are deleted. An existing repo whose visibility differs from
 * `isPrivate` is rejected before anything is uploaded. When the resulting tree
 * equals the head's tree, no commit is made and the head is returned.
 */
export async function publishTree(
  octokit: PublishOctokit,
  opts: {
    owner: string;
    repo: string;
    isPrivate: boolean;
    files: RenderedFile[];
    /** Previously published paths to delete; absent paths are ignored. */
    removePaths?: string[];
    message: string;
  },
): Promise<PublishTreeResult> {
  const { owner, repo, isPrivate, files, removePaths = [], message } = opts;
  const requested: RepoVisibility = isPrivate ? "private" : "public";

  // 1. Create the repo if it does not exist yet. `auto_init` gives us a base
  //    branch + initial commit so a ref exists to build the next commit on. An
  //    existing repo must already have the requested visibility.
  let defaultBranch: string;
  let htmlUrl: string;
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    const actual = toRepoVisibility(data.visibility, data.private);
    if (actual !== requested) {
      throw new PublishVisibilityError({ owner, repo, requested, actual });
    }
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

  // 2. Resolve the current branch head (the parent of our new commit) and its
  //    tree (the base our changes are layered onto).
  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref });
  const baseCommitSha = refData.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = baseCommit.tree.sha;

  // 3. Blob per file.
  const upserts = await Promise.all(
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

  // 4. Deletions: a `sha: null` entry removes a path from the base tree. GitHub
  //    rejects deleting a path that does not exist, so only paths still present
  //    are removed (a user may have deleted one by hand), and never a path we
  //    are writing in this same commit.
  const writing = new Set(files.map((file) => file.path));
  const present = await findExistingBlobPaths(
    octokit,
    { owner, repo, treeSha: baseTreeSha },
    removePaths.filter((path) => !writing.has(path)),
  );
  const deletions = present.map((path) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    sha: null,
  }));

  // 5. Tree layered on the current head's tree.
  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [...upserts, ...deletions],
  });

  // Git trees are content-addressed: an identical SHA means nothing changed.
  if (treeData.sha === baseTreeSha) {
    return {
      commitSha: baseCommitSha,
      branch: defaultBranch,
      htmlUrl,
      committed: false,
    };
  }

  // 6. Commit pointing at the new tree with the current head as parent.
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: treeData.sha,
    parents: [baseCommitSha],
  });

  // 7. Fast-forward the branch to the new commit.
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref,
    sha: commit.sha,
  });

  return {
    commitSha: commit.sha,
    branch: defaultBranch,
    htmlUrl,
    committed: true,
  };
}

/**
 * Normalizes GitHub's repo visibility. `visibility` is the authoritative field
 * (it distinguishes `internal`); `private` is the fallback for older payloads.
 */
function toRepoVisibility(
  visibility: string | undefined,
  isPrivate: boolean,
): RepoVisibility {
  if (
    visibility === "public" ||
    visibility === "private" ||
    visibility === "internal"
  ) {
    return visibility;
  }
  return isPrivate ? "private" : "public";
}

/** The fields of a Git Data API tree entry the path walk reads. */
interface TreeEntry {
  path?: string;
  type?: string;
  sha?: string;
}

/**
 * Returns the subset of `paths` that exist as blobs under the given tree. Walks
 * one directory level per request (caching each tree), so it costs nothing when
 * `paths` is empty and is not subject to recursive-listing truncation.
 */
async function findExistingBlobPaths(
  octokit: PublishOctokit,
  where: { owner: string; repo: string; treeSha: string },
  paths: string[],
): Promise<string[]> {
  const { owner, repo, treeSha } = where;
  const entriesByTree = new Map<string, Promise<TreeEntry[]>>();
  const listTree = (sha: string): Promise<TreeEntry[]> => {
    let entries = entriesByTree.get(sha);
    if (!entries) {
      entries = octokit.rest.git
        .getTree({ owner, repo, tree_sha: sha })
        .then(({ data }) => data.tree);
      entriesByTree.set(sha, entries);
    }
    return entries;
  };

  const existing: string[] = [];
  for (const path of paths) {
    const segments = path.split("/");
    let currentSha: string | undefined = treeSha;
    for (const [index, segment] of segments.entries()) {
      if (currentSha === undefined) break;
      const isLeaf = index === segments.length - 1;
      const entry: TreeEntry | undefined = (await listTree(currentSha)).find(
        (candidate) =>
          candidate.path === segment &&
          candidate.type === (isLeaf ? "blob" : "tree"),
      );
      currentSha = entry?.sha;
      if (isLeaf && entry) existing.push(path);
    }
  }
  return existing;
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
