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

export type SkillSource = GitHubSource | LocalSource;

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/([^/]+))?$/;
const SHORTHAND_RE = /^([^/.][^/]*)\/([^/]+)(?:\/(.+))?$/;

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
