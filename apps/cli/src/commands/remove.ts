import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { rm, stat } from "node:fs/promises";

import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import checkbox from "@inquirer/checkbox";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

import {
  loadManifest,
  saveManifest,
  removeSkill,
  getSkill,
} from "../core/manifest.js";
import { loadConfig } from "../core/config.js";
import { getEnabledAdapters, resolveAgents } from "../adapters/index.js";

interface RemoveOptions {
  skill?: string;
  yes?: boolean;
  global?: boolean;
  all?: boolean;
}

/**
 * Resolve the target directory for skill removal.
 */
function resolveTargetDir(config: { skillsDir: string }, opts: RemoveOptions): string {
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
 * Run adapter.remove() for each enabled agent, logging results.
 * Adapter failures are warnings and don't fail the overall command.
 */
async function runAdapterRemoves(
  projectRoot: string,
  agents: AgentId[],
  skillName: string,
): Promise<void> {
  const adapters = getEnabledAdapters(agents);
  const removed: string[] = [];

  for (const adapter of adapters) {
    try {
      await adapter.remove(projectRoot, skillName);
      removed.push(adapter.displayName);
    } catch (err) {
      console.warn(
        chalk.yellow(
          `  Warning: ${adapter.displayName} adapter failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      );
    }
  }

  if (removed.length > 0) {
    console.log(chalk.cyan(`  Removed from: ${removed.join(", ")}`));
  }
}

/**
 * Remove a single skill by name.
 */
export async function removeSingleSkill(
  skillName: string,
  targetDir: string,
  projectRoot: string,
  manifest: Manifest,
  skipConfirm: boolean,
  agents: AgentId[],
): Promise<Manifest> {
  const existing = getSkill(manifest, skillName);
  if (!existing) {
    console.error(chalk.red(`Skill "${skillName}" is not installed.`));
    return manifest;
  }

  if (!skipConfirm) {
    const { default: confirm } = await import("@inquirer/confirm");
    const confirmed = await confirm({
      message: `Remove skill "${skillName}"?`,
      default: false,
    });
    if (!confirmed) {
      console.log(chalk.dim(`Skipped ${skillName}`));
      return manifest;
    }
  }

  const spinner = ora(`Removing ${skillName}...`).start();
  try {
    const skillPath = join(targetDir, skillName);
    const exists = await stat(skillPath).then(() => true).catch(() => false);
    if (exists) {
      await rm(skillPath, { recursive: true, force: true });
    }

    manifest = removeSkill(manifest, skillName);
    await saveManifest(projectRoot, manifest);

    spinner.succeed(`Removed ${chalk.bold(skillName)}`);

    // Run adapter removes for each enabled agent
    await runAdapterRemoves(projectRoot, agents, skillName);
  } catch (err) {
    spinner.fail(`Failed to remove ${skillName}`);
    console.error(
      chalk.red(err instanceof Error ? err.message : "Unknown error occurred"),
    );
  }

  return manifest;
}

export function registerRemoveCommand(program: Command): void {
  program
    .command("remove [skill-name]")
    .aliases(["r", "uninstall"])
    .description("Remove an installed skill")
    .option("--skill <names>", "Comma-separated skill names to remove")
    .option("-y, --yes", "Skip confirmation prompts")
    .option("-g, --global", "Remove from ~/.agents/skills/ instead of project directory")
    .option("--all", "Remove all installed skills")
    .action(async (skillName: string | undefined, opts: RemoveOptions) => {
      const projectRoot = process.cwd();
      const config = await loadConfig();
      const targetDir = resolveTargetDir(config, opts);

      // --all sets --yes
      if (opts.all) {
        opts.yes = true;
      }

      // Resolve agents for adapter removal
      const agents = await resolveAgents(projectRoot);

      let manifest = await loadManifest(projectRoot);

      if (!manifest || Object.keys(manifest.skills).length === 0) {
        console.log(chalk.yellow("No skills installed."));
        return;
      }

      // Determine which skills to remove
      let skillNames: string[];

      if (opts.all) {
        skillNames = Object.keys(manifest.skills);
      } else if (opts.skill) {
        skillNames = parseSkillNames(opts.skill);
      } else if (skillName) {
        skillNames = [skillName];
      } else {
        // Interactive selection from installed skills
        const installed = Object.keys(manifest.skills);
        if (installed.length === 0) {
          console.log(chalk.yellow("No skills installed."));
          return;
        }

        const selected = await checkbox({
          message: "Select skills to remove:",
          choices: installed.map((name) => ({
            name,
            value: name,
          })),
        });

        if (selected.length === 0) {
          console.log(chalk.dim("No skills selected."));
          return;
        }

        skillNames = selected;
        // Already selected interactively, skip per-skill confirmation
        opts.yes = true;
      }

      for (const name of skillNames) {
        manifest = await removeSingleSkill(
          name,
          targetDir,
          projectRoot,
          manifest,
          opts.yes ?? false,
          agents,
        );
      }
    });
}
