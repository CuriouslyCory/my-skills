import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { stat } from "node:fs/promises";

import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import search from "@inquirer/search";

import type { AgentId, Manifest, SkillEntry } from "@curiouslycory/shared-types";
import { AgentIdSchema } from "@curiouslycory/shared-types";

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

interface AddOptions {
  skill?: string;
  agent?: string;
  yes?: boolean;
  global?: boolean;
  copy?: boolean;
  all?: boolean;
  list?: boolean;
}

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

/**
 * Resolve the target directory for skill installation.
 */
function resolveTargetDir(config: { skillsDir: string }, opts: AddOptions): string {
  if (opts.global) {
    return join(homedir(), ".agents", "skills");
  }
  return resolve(process.cwd(), config.skillsDir);
}

/**
 * Parse comma-separated skill names from --skill flag.
 */
function parseSkillNames(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse and validate comma-separated agent IDs from --agent flag.
 */
function parseAgentIds(raw: string): AgentId[] {
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    const result = AgentIdSchema.safeParse(id);
    if (!result.success) {
      throw new Error(`Invalid agent ID: "${id}". Valid agents: ${AgentIdSchema.options.join(", ")}`);
    }
  }
  return ids as AgentId[];
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

/**
 * Install a single skill by name from a cached repo.
 */
async function installSingleSkill(
  skillName: string,
  githubSource: GitHubSource,
  cachePath: string,
  targetDir: string,
  projectRoot: string,
  manifest: Manifest,
  agents?: AgentId[],
): Promise<Manifest> {
  const installSpinner = ora(`Installing ${skillName}...`).start();
  try {
    const resolved = await resolveSkill(skillName, cachePath);
    const hash = await installSkill(resolved, targetDir);

    const entry: SkillEntry = {
      source: `${githubSource.owner}/${githubSource.repo}`,
      sourceType: "github",
      computedHash: hash,
      installedAt: new Date().toISOString(),
      agents: agents,
    };

    manifest = addSkill(manifest, skillName, entry);
    await saveManifest(projectRoot, manifest);

    installSpinner.succeed(
      `Installed ${chalk.bold(skillName)} to ${chalk.dim(join(targetDir.replace(process.cwd() + "/", ""), skillName))}`,
    );
    return manifest;
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
    return manifest;
  }
}

export function registerAddCommand(program: Command): void {
  program
    .command("add [source]")
    .aliases(["a", "i", "install"])
    .description("Install a skill from a GitHub repository or restore all from manifest")
    .option("--skill <names>", "Comma-separated skill names to install without interactive picker")
    .option("--agent <agents>", "Comma-separated agent targets to override defaults")
    .option("-y, --yes", "Skip all confirmation prompts")
    .option("-g, --global", "Install to ~/.agents/skills/ instead of project directory")
    .option("--copy", "Copy files instead of relying on canonical location")
    .option("--all", "Shorthand for --skill '*' --agent '*' -y")
    .option("-l, --list", "List available skills in the repo without installing")
    .action(async (source: string | undefined, opts: AddOptions) => {
      const projectRoot = process.cwd();
      const config = await loadConfig();
      const targetDir = resolveTargetDir(config, opts);

      // --all is shorthand for --skill '*' --agent '*' -y
      if (opts.all) {
        opts.skill = opts.skill ?? "*";
        opts.agent = opts.agent ?? "*";
        opts.yes = true;
      }

      // Parse agent IDs if provided
      let agents: AgentId[] | undefined;
      if (opts.agent) {
        if (opts.agent === "*") {
          agents = [...AgentIdSchema.options];
        } else {
          try {
            agents = parseAgentIds(opts.agent);
          } catch (err) {
            console.error(chalk.red(err instanceof Error ? err.message : "Invalid agent IDs"));
            return;
          }
        }
      }

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

      // --list flag: just show available skills and exit
      if (opts.list) {
        const discovered = await discoverSkills(cachePath);
        if (discovered.length === 0) {
          console.log(chalk.yellow("No skills found in this repository."));
          return;
        }
        console.log(chalk.bold(`\nAvailable skills in ${githubSource.owner}/${githubSource.repo}:\n`));
        for (const s of discovered) {
          console.log(`  ${chalk.green(s.name)}  ${chalk.dim(s.description)}`);
        }
        console.log("");
        return;
      }

      // Determine which skills to install
      let skillNames: string[];

      if (githubSource.skill) {
        // Direct skill name in source (owner/repo/skill-name)
        skillNames = [githubSource.skill];
      } else if (opts.skill) {
        // --skill flag provided
        if (opts.skill === "*") {
          // Install all skills from the repo
          const discovered = await discoverSkills(cachePath);
          if (discovered.length === 0) {
            console.log(chalk.red("No skills found in this repository."));
            return;
          }
          skillNames = discovered.map((s) => s.name);
        } else {
          skillNames = parseSkillNames(opts.skill);
        }
      } else {
        // No skill name - discover and present picker (or auto-select if only one)
        const discoverSpinner = ora("Discovering skills...").start();
        const discovered = await discoverSkills(cachePath);
        discoverSpinner.stop();

        if (discovered.length === 0) {
          console.log(chalk.red("No skills found in this repository."));
          return;
        }

        if (discovered.length === 1) {
          skillNames = [discovered[0]!.name];
          console.log(chalk.dim(`Found one skill: ${skillNames[0]}`));
        } else if (opts.yes) {
          // With --yes and no --skill, install all discovered skills
          skillNames = discovered.map((s) => s.name);
        } else {
          const selectedName = await search({
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
          skillNames = [selectedName];
        }
      }

      // Install each skill
      for (const skillName of skillNames) {
        // Check if already installed
        const existing = getSkill(manifest, skillName);
        if (existing) {
          console.log(
            chalk.yellow(
              `Skill "${skillName}" is already installed. Use ${chalk.bold("ms update")} to update it.`,
            ),
          );
          continue;
        }

        manifest = await installSingleSkill(
          skillName,
          githubSource,
          cachePath,
          targetDir,
          projectRoot,
          manifest,
          agents,
        );
      }
    });
}
