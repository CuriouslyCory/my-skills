import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import search from "@inquirer/search";

import { loadConfig } from "../core/config.js";
import { loadManifest } from "../core/manifest.js";
import {
  fetchRepo,
  getCachedRepoPath,
  isCacheStale,
  discoverSkills,
} from "../services/cache.js";
import { parseSource } from "../services/source-parser.js";
import type { GitHubSource } from "../services/source-parser.js";

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
  const installedNames = new Set(
    manifest ? Object.keys(manifest.skills) : [],
  );
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

      const selectedName = await search({
        message: "Search for a skill:",
        source: (input: string | undefined) => {
          const term = (input ?? query ?? "").toLowerCase();
          return results
            .filter(
              (r) =>
                !term ||
                r.name.toLowerCase().includes(term) ||
                r.description.toLowerCase().includes(term),
            )
            .map((r) => {
              const badge = r.installed
                ? chalk.green(" [installed]")
                : "";
              const desc = r.description
                ? ` - ${chalk.dim(r.description)}`
                : "";
              return {
                name: `${r.name}${desc} ${chalk.dim(`(${r.source})`)}${badge}`,
                value: r.name,
              };
            });
        },
      });

      // Find the selected result
      const selected = results.find((r) => r.name === selectedName);
      if (!selected) return;

      if (selected.installed) {
        console.log(
          chalk.dim(`${selected.name} is already installed.`),
        );
        return;
      }

      // Prompt to install
      const { default: confirm } = await import("@inquirer/confirm");
      const shouldInstall = await confirm({
        message: `Install ${chalk.bold(selected.name)} from ${selected.source}?`,
      });

      if (!shouldInstall) return;

      // Delegate to add command by programmatically calling it
      const source = `${selected.source}/${selected.name}`;
      await program.parseAsync(["add", source], { from: "user" });
    });
}
