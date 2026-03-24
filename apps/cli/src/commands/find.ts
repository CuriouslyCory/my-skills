import { resolve } from "node:path";
import type { Command } from "commander";
import checkbox from "@inquirer/checkbox";
import chalk from "chalk";
import ora from "ora";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

import type { GitHubSource } from "../services/source-parser.js";
import { resolveAgents } from "../adapters/index.js";
import { loadConfig } from "../core/config.js";
import { getSkill, loadManifest } from "../core/manifest.js";
import { migrateFromSkillsLock } from "../core/migration.js";
import {
  discoverSkills,
  fetchRepo,
  getCachedRepoPath,
  isCacheStale,
} from "../services/cache.js";
import { parseSource } from "../services/source-parser.js";
import { installSingleSkill } from "./add.js";

interface FindResult {
  name: string;
  description: string;
  source: string;
  installed: boolean;
  githubSource: GitHubSource;
}

/**
 * Parse an "owner/repo" favorite string into a GitHubSource.
 */
function favoriteToGitHub(favorite: string): GitHubSource {
  const parsed = parseSource(favorite);
  if (parsed.type !== "github") {
    throw new Error(`Favorite "${favorite}" is not a valid GitHub source.`);
  }
  return parsed;
}

/**
 * Build the search index from installed skills + favorite repos.
 */
async function buildSearchIndex(): Promise<FindResult[]> {
  const config = await loadConfig();
  const manifest = await loadManifest(process.cwd());
  const installedNames = new Set(manifest ? Object.keys(manifest.skills) : []);
  const results: FindResult[] = [];

  // Add installed skills from manifest
  if (manifest) {
    for (const [name, entry] of Object.entries(manifest.skills)) {
      const parts = entry.source.split("/");
      results.push({
        name,
        description: "",
        source: entry.source,
        installed: true,
        githubSource: {
          type: "github",
          owner: parts[0] ?? "",
          repo: parts[1] ?? "",
          skill: name,
          url: `https://github.com/${entry.source}.git`,
        },
      });
    }
  }

  // Add skills from favorite repos
  if (config.favoriteRepos.length > 0) {
    const spinner = ora("Fetching favorite repos...").start();

    for (const favorite of config.favoriteRepos) {
      try {
        const githubSource = favoriteToGitHub(favorite);
        spinner.text = `Checking ${favorite}...`;

        // Fetch if not cached or stale
        const cached = await getCachedRepoPath(githubSource);
        let cachePath: string;

        if (!cached || (await isCacheStale(githubSource))) {
          spinner.text = `Fetching ${favorite}...`;
          cachePath = await fetchRepo(githubSource);
        } else {
          cachePath = cached;
        }

        const discovered = await discoverSkills(cachePath);
        for (const skill of discovered) {
          // Skip if already in results (from manifest)
          if (installedNames.has(skill.name)) continue;

          results.push({
            name: skill.name,
            description: skill.description,
            source: `${githubSource.owner}/${githubSource.repo}`,
            installed: false,
            githubSource: {
              ...githubSource,
              skill: skill.name,
            },
          });
        }
      } catch (err) {
        spinner.warn(
          `Failed to fetch ${favorite}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    spinner.stop();
  }

  return results;
}

export function registerFindCommand(program: Command): void {
  program
    .command("find [query]")
    .alias("f")
    .description("Search for skills across favorites and installed skills")
    .action(async (query: string | undefined) => {
      const results = await buildSearchIndex();

      if (results.length === 0) {
        console.log(
          chalk.yellow(
            "No skills found. Add favorite repos with: ms config set favoriteRepos owner/repo1,owner/repo2",
          ),
        );
        return;
      }

      // Pre-filter by query if provided
      const filtered = query
        ? results.filter(
            (r) =>
              r.name.toLowerCase().includes(query.toLowerCase()) ||
              r.description.toLowerCase().includes(query.toLowerCase()),
          )
        : results;

      if (filtered.length === 0) {
        console.log(chalk.yellow(`No skills matching "${query}".`));
        return;
      }

      const selectedNames = await checkbox({
        message: "Select skills to install:",
        choices: filtered.map((r) => {
          const desc = r.description ? ` - ${chalk.dim(r.description)}` : "";
          const badge = r.installed ? chalk.green(" [installed]") : "";
          return {
            name: `${r.name}${desc} ${chalk.dim(`(${r.source})`)}${badge}`,
            value: r.name,
            disabled: r.installed ? "already installed" : false,
          };
        }),
      });

      if (selectedNames.length === 0) {
        console.log(chalk.dim("No skills selected."));
        return;
      }

      // Resolve project context for installation
      const projectRoot = process.cwd();
      const config = await loadConfig();
      const targetDir = resolve(projectRoot, config.skillsDir);
      const agents: AgentId[] = await resolveAgents(projectRoot);

      let manifest: Manifest | null = await loadManifest(projectRoot);
      manifest ??= await migrateFromSkillsLock(projectRoot);
      manifest ??= { version: 1, agents: [], skills: {} };

      // Group selected skills by source repo for efficient fetching
      const byRepo = new Map<string, FindResult[]>();
      for (const name of selectedNames) {
        const result = filtered.find((r) => r.name === name);
        if (!result) continue;
        const key = `${result.githubSource.owner}/${result.githubSource.repo}`;
        const group = byRepo.get(key) ?? [];
        group.push(result);
        byRepo.set(key, group);
      }

      for (const [repoKey, skills] of byRepo) {
        // Fetch repo once per source
        const firstSkill = skills[0];
        if (!firstSkill) continue;

        const spinner = ora(`Fetching ${repoKey}...`).start();
        let cachePath: string;
        try {
          cachePath = await fetchRepo(firstSkill.githubSource);
          spinner.succeed(`Repository fetched: ${repoKey}`);
        } catch (err) {
          spinner.fail(`Failed to fetch ${repoKey}`);
          console.error(
            chalk.red(err instanceof Error ? err.message : "Unknown error"),
          );
          continue;
        }

        for (const skill of skills) {
          if (getSkill(manifest, skill.name)) {
            console.log(
              chalk.yellow(`Skill "${skill.name}" is already installed.`),
            );
            continue;
          }

          manifest = await installSingleSkill(
            skill.name,
            skill.githubSource,
            cachePath,
            targetDir,
            projectRoot,
            manifest,
            agents,
          );
        }
      }
    });
}
