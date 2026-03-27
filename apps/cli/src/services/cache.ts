import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GitService } from "@curiouslycory/git-service";
import { parseSkillFrontmatter } from "@curiouslycory/shared-types";

import type { GitHubSource } from "./source-parser.js";
import { loadConfig } from "../core/config.js";

const META_FILENAME = ".my-skills-cache-meta.json";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheMeta {
  lastFetched: string;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
}

export async function getCachePath(source: GitHubSource): Promise<string> {
  const config = await loadConfig();
  return join(config.cacheDir, source.owner, source.repo);
}

export async function fetchRepo(source: GitHubSource): Promise<string> {
  const cachePath = await getCachePath(source);
  await mkdir(cachePath, { recursive: true });

  const isExisting = await stat(join(cachePath, ".git"))
    .then(() => true)
    .catch(() => false);

  if (isExisting) {
    const git = new GitService(cachePath);
    await git.fetch({ remote: "origin" });
    await git.resetHard("origin/HEAD");
  } else {
    const parentGit = new GitService(cachePath);
    await parentGit.clone(source.url, cachePath, { depth: 1 });
  }

  // Write cache metadata
  const meta: CacheMeta = { lastFetched: new Date().toISOString() };
  await writeFile(
    join(cachePath, META_FILENAME),
    JSON.stringify(meta, null, 2) + "\n",
    "utf-8",
  );

  return cachePath;
}

export async function isCacheStale(
  source: GitHubSource,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const cachePath = await getCachePath(source);
  try {
    const raw = await readFile(join(cachePath, META_FILENAME), "utf-8");
    const meta = JSON.parse(raw) as CacheMeta;
    const lastFetched = new Date(meta.lastFetched).getTime();
    return Date.now() - lastFetched > ttlMs;
  } catch {
    return true;
  }
}

export async function getCachedRepoPath(
  source: GitHubSource,
): Promise<string | null> {
  const cachePath = await getCachePath(source);
  try {
    await stat(join(cachePath, ".git"));
    return cachePath;
  } catch {
    return null;
  }
}

export async function discoverSkills(
  repoPath: string,
): Promise<DiscoveredSkill[]> {
  const skills: DiscoveredSkill[] = [];
  await walkForSkills(repoPath, repoPath, skills);
  return skills;
}

async function walkForSkills(
  basePath: string,
  currentPath: string,
  results: DiscoveredSkill[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".agents"
    )
      continue;

    const fullPath = join(currentPath, entry.name);

    if (entry.isFile() && entry.name === "SKILL.md") {
      try {
        const content = await readFile(fullPath, "utf-8");
        const { frontmatter } = parseSkillFrontmatter(content);
        results.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: currentPath,
        });
      } catch (err) {
        console.warn(
          `Warning: Skipping ${fullPath} — invalid frontmatter: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    } else if (entry.isDirectory()) {
      await walkForSkills(basePath, fullPath, results);
    }
  }
}
