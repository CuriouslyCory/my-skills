import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GitService } from "@curiouslycory/git-service";
import { parseSkillFrontmatter } from "@curiouslycory/shared-types";

import type { GitHubSource } from "./source-parser.js";
import { loadConfig } from "../core/config.js";
import { loadManifest } from "../core/manifest.js";

const META_FILENAME = ".my-skills-cache-meta.json";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheMeta {
  lastFetched: string;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
  /** If set, install this skill from the originating source rather than the browsed repo */
  overrideSource?: { source: string; sourceType: string };
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

  // Also surface skills from .my-skills.json that live in .agents/ or .claude/
  const manifestSkills = await discoverManifestReferencedSkills(repoPath, skills);
  skills.push(...manifestSkills);

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
      entry.name === ".agents" ||
      entry.name === ".claude"
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

/**
 * Discover skills referenced in a repo's .my-skills.json that are physically
 * present in .agents/skills/ or .claude/skills/ but were excluded from the
 * normal directory walk. Returns them with overrideSource set so the caller
 * can install from the originating repo instead of the browsed repo.
 */
async function discoverManifestReferencedSkills(
  repoPath: string,
  alreadyFound: DiscoveredSkill[],
): Promise<DiscoveredSkill[]> {
  const manifest = await loadManifest(repoPath);
  if (!manifest) return [];

  const alreadyFoundNames = new Set(alreadyFound.map((s) => s.name));
  const results: DiscoveredSkill[] = [];

  for (const [skillName, entry] of Object.entries(manifest.skills)) {
    if (alreadyFoundNames.has(skillName)) continue;
    if (entry.sourceType !== "github") continue; // only github supported for now

    // Look for the physical SKILL.md in .agents/skills/ or .claude/skills/
    const candidatePaths = [
      join(repoPath, ".agents", "skills", skillName),
      join(repoPath, ".claude", "skills", skillName),
    ];

    for (const candidatePath of candidatePaths) {
      try {
        const content = await readFile(
          join(candidatePath, "SKILL.md"),
          "utf-8",
        );
        const { frontmatter } = parseSkillFrontmatter(content);
        results.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: candidatePath,
          overrideSource: { source: entry.source, sourceType: entry.sourceType },
        });
        break; // found it; no need to check the other candidate path
      } catch {
        // not present at this path; try next
      }
    }
  }

  return results;
}
