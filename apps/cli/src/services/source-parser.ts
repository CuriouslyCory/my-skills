import { resolve } from "node:path";

export interface GitHubSource {
  type: "github";
  owner: string;
  repo: string;
  skill: string | undefined;
  url: string;
}

export interface LocalSource {
  type: "local";
  path: string;
}

/**
 * The authenticated user's personal cloud library. `@me` browses everything;
 * `@me/<name>` targets a single artifact. Resolved through the `library.*` tRPC
 * procedures rather than a git remote.
 */
export interface CloudSource {
  type: "cloud";
  /** Artifact name, or undefined when browsing the whole library (`@me`). */
  name: string | undefined;
}

export type SkillSource = GitHubSource | LocalSource | CloudSource;

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/([^/]+))?$/;
const SHORTHAND_RE = /^([^/.][^/]*)\/([^/]+)(?:\/(.+))?$/;
/** `@me` (browse all) or `@me/<name>` (single artifact). */
const CLOUD_RE = /^@me(?:\/(.+))?$/;

/** The manifest `source` prefix for a personal-library (cloud) entry. */
export const CLOUD_SOURCE_PREFIX = "@me";

/**
 * Recover the artifact name from a cloud manifest `source` string
 * (`@me/<name>` -> `<name>`).
 */
export function cloudSourceName(source: string): string {
  const match = CLOUD_RE.exec(source);
  if (!match?.[1]) {
    throw new Error(`Invalid cloud source: "${source}" (expected @me/<name>)`);
  }
  return match[1];
}

/**
 * Parse an "owner/repo" source string from a manifest entry into a GitHubSource.
 */
export function sourceToGitHub(source: string): GitHubSource {
  const parts = source.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid manifest source format: "${source}"`);
  }
  return {
    type: "github",
    owner: parts[0],
    repo: parts[1],
    skill: undefined,
    url: `https://github.com/${parts[0]}/${parts[1]}.git`,
  };
}

export function parseSource(source: string): SkillSource {
  // Local path: starts with ./ or ../ or /
  if (
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("/")
  ) {
    return {
      type: "local",
      path: resolve(source),
    };
  }

  // Personal cloud library: `@me` (browse) or `@me/<name>` (single artifact).
  // Checked before the shorthand regex so `@me/foo` is not read as owner/repo.
  const cloudMatch = CLOUD_RE.exec(source);
  if (cloudMatch) {
    return { type: "cloud", name: cloudMatch[1] ?? undefined };
  }

  // GitHub URL
  const urlMatch = GITHUB_URL_RE.exec(source);
  if (urlMatch) {
    const [, owner, repo, skill] = urlMatch;
    if (!owner || !repo) throw new Error(`Unable to parse source: "${source}"`);
    return {
      type: "github",
      owner,
      repo,
      skill: skill ?? undefined,
      url: `https://github.com/${owner}/${repo}.git`,
    };
  }

  // Shorthand: owner/repo or owner/repo/skill-name
  const shortMatch = SHORTHAND_RE.exec(source);
  if (shortMatch) {
    const [, owner, repo, skill] = shortMatch;
    if (!owner || !repo) throw new Error(`Unable to parse source: "${source}"`);
    return {
      type: "github",
      owner,
      repo,
      skill: skill ?? undefined,
      url: `https://github.com/${owner}/${repo}.git`,
    };
  }

  throw new Error(
    `Unable to parse source: "${source}". Expected owner/repo, owner/repo/skill-name, a GitHub URL, or a local path (./path).`,
  );
}
