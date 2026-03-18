import { join, resolve } from "node:path";
import { stat } from "node:fs/promises";

import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import search from "@inquirer/search";

import type { Manifest, SkillEntry } from "@curiouslycory/shared-types";

import { parseSource } from "../services/source-parser.js";
import type { GitHubSource } from "../services/source-parser.js";
import { fetchRepo, discoverSkills } from "../services/cache.js";
import { resolveSkill } from "../core/skill-resolver.js";
import { installSkill } from "../core/skill-installer.js";
import { computeSkillHash } from "../core/skill-hasher.js";
import {
  loadManifest,
  saveManifest,
  addSkill,
  getSkill,
} from "../core/manifest.js";
import { migrateFromSkillsLock } from "../core/migration.js";
import { loadConfig } from "../core/config.js";

/**
 * Parse an "owner/repo" source string from a manifest entry into a GitHubSource.
 */
function sourceToGitHub(source: string): GitHubSource {
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

async function restoreFromManifest(
  manifest: Manifest,
  targetDir: string,
): Promise<void> {
  const entries = Object.entries(manifest.skills);

  if (entries.length === 0) {
    console.log(
      chalk.yellow("Manifest has no skills. Use ms add <owner/repo/skill-name> to install one."),
    );
    return;
  }

  let installed = 0;
  let upToDate = 0;
  let failed = 0;

  for (const [skillName, entry] of entries) {
    // Check if already installed with matching hash
    const destPath = join(targetDir, skillName);
    const exists = await stat(destPath).then(() => true).catch(() => false);

    if (exists) {
      try {
        const localHash = await computeSkillHash(destPath);
        if (localHash === entry.computedHash) {
          console.log(chalk.dim(`  ${skillName} - already up to date`));
          upToDate++;
          continue;
        }
      } catch {
        // If hash fails, re-install
      }
    }

    // Resolve source and install
    const spinner = ora(`Installing ${skillName}...`).start();
    try {
      if (entry.sourceType !== "github") {
        spinner.fail(`${skillName} - unsupported source type "${entry.sourceType}"`);
        failed++;
        continue;
      }

      const githubSource = sourceToGitHub(entry.source);
      const cachePath = await fetchRepo(githubSource);
      const resolved = await resolveSkill(skillName, cachePath);
      await installSkill(resolved, targetDir);

      spinner.succeed(`Installed ${skillName}`);
      installed++;
    } catch (err) {
      spinner.fail(`${skillName} - ${err instanceof Error ? err.message : "Unknown error"}`);
      failed++;
    }
  }

  // Summary
  console.log("");
  const parts: string[] = [];
  if (installed > 0) parts.push(chalk.green(`${installed} installed`));
  if (upToDate > 0) parts.push(chalk.dim(`${upToDate} already up-to-date`));
  if (failed > 0) parts.push(chalk.red(`${failed} failed`));
  console.log(`Summary: ${parts.join(", ")}`);
}

export function registerAddCommand(program: Command): void {
  program
    .command("add [source]")
    .aliases(["a", "i", "install"])
    .description("Install a skill from a GitHub repository or restore all from manifest")
    .action(async (source?: string) => {
      const projectRoot = process.cwd();
      const config = await loadConfig();
      const targetDir = resolve(projectRoot, config.skillsDir);

      // Load or create manifest
      let manifest: Manifest | null = await loadManifest(projectRoot);

      // If no manifest, try migration from skills-lock.json
      if (!manifest) {
        manifest = await migrateFromSkillsLock(projectRoot);
      }

      if (!source) {
        if (!manifest) {
          console.log(
            chalk.yellow(
              "No manifest found (.my-skills.json). Use ms add <owner/repo/skill-name> to install a skill.",
            ),
          );
          console.log(
            chalk.dim("  Example: ms add curiouslycory/my-skills-collection/tdd"),
          );
          console.log(
            chalk.dim("  Example: ms add curiouslycory/my-skills-collection"),
          );
          return;
        }

        await restoreFromManifest(manifest, targetDir);
        return;
      }

      // Ensure we have a manifest for source-based installs
      if (!manifest) {
        manifest = {
          version: 1,
          agents: [],
          skills: {},
        };
      }

      const parsed = parseSource(source);

      if (parsed.type === "local") {
        console.log(
          chalk.red("Local source install is not yet supported in add command."),
        );
        return;
      }

      const githubSource: GitHubSource = parsed;

      // Fetch repo to cache
      const spinner = ora("Fetching repository...").start();
      let cachePath: string;
      try {
        cachePath = await fetchRepo(githubSource);
        spinner.succeed("Repository fetched");
      } catch (err) {
        spinner.fail("Failed to fetch repository");
        console.error(
          chalk.red(
            err instanceof Error ? err.message : "Unknown error occurred",
          ),
        );
        return;
      }

      let skillName: string;

      if (githubSource.skill) {
        // Direct skill name provided
        skillName = githubSource.skill;
      } else {
        // No skill name - discover and present picker
        const discoverSpinner = ora("Discovering skills...").start();
        const discovered = await discoverSkills(cachePath);
        discoverSpinner.stop();

        if (discovered.length === 0) {
          console.log(chalk.red("No skills found in this repository."));
          return;
        }

        if (discovered.length === 1) {
          skillName = discovered[0]!.name;
          console.log(chalk.dim(`Found one skill: ${skillName}`));
        } else {
          skillName = await search({
            message: "Select a skill to install:",
            source: (input: string | undefined) => {
              const term = (input ?? "").toLowerCase();
              return discovered
                .filter(
                  (s) =>
                    !term ||
                    s.name.toLowerCase().includes(term) ||
                    s.description.toLowerCase().includes(term),
                )
                .map((s) => ({
                  name: `${s.name} - ${chalk.dim(s.description)}`,
                  value: s.name,
                }));
            },
          });
        }
      }

      // Check if already installed
      const existing = getSkill(manifest, skillName);
      if (existing) {
        console.log(
          chalk.yellow(
            `Skill "${skillName}" is already installed. Use ${chalk.bold("ms update")} to update it.`,
          ),
        );
        return;
      }

      // Resolve and install
      const installSpinner = ora(`Installing ${skillName}...`).start();
      try {
        const resolved = await resolveSkill(skillName, cachePath);
        const hash = await installSkill(resolved, targetDir);

        const entry: SkillEntry = {
          source: `${githubSource.owner}/${githubSource.repo}`,
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        };

        manifest = addSkill(manifest, skillName, entry);
        await saveManifest(projectRoot, manifest);

        installSpinner.succeed(
          `Installed ${chalk.bold(skillName)} to ${chalk.dim(join(config.skillsDir, skillName))}`,
        );
      } catch (err) {
        installSpinner.fail(`Failed to install ${skillName}`);
        if (
          err instanceof Error &&
          err.message.includes("not found in repository")
        ) {
          console.error(
            chalk.red(`Skill "${skillName}" not found in the repository.`),
          );
        } else {
          console.error(
            chalk.red(
              err instanceof Error ? err.message : "Unknown error occurred",
            ),
          );
        }
      }
    });
}
