import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import type {
  AgentId,
  Manifest,
  SkillEntry,
} from "@curiouslycory/shared-types";

import type { AdapterSkillEntry } from "../adapters/index.js";
import { sourceToGitHub } from "../services/source-parser.js";
import { getEnabledAdapters } from "../adapters/index.js";
import { loadConfig } from "../core/config.js";
import {
  addSkill,
  getSkill,
  loadManifest,
  saveManifest,
} from "../core/manifest.js";
import { installSkill } from "../core/skill-installer.js";
import { resolveSkill } from "../core/skill-resolver.js";
import { fetchRepo } from "../services/cache.js";

interface UpdateOptions {
  global?: boolean;
}

/**
 * Run adapter.install() for each enabled agent, logging results.
 */
async function runAdapterInstalls(
  projectRoot: string,
  agents: AgentId[],
  skill: AdapterSkillEntry,
): Promise<void> {
  const adapters = getEnabledAdapters(agents);
  const deployed: string[] = [];

  for (const adapter of adapters) {
    try {
      await adapter.install(projectRoot, skill);
      deployed.push(adapter.displayName);
    } catch (err) {
      console.warn(
        chalk.yellow(
          `  Warning: ${adapter.displayName} adapter failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      );
    }
  }

  if (deployed.length > 0) {
    console.log(chalk.cyan(`  Deployed to: ${deployed.join(", ")}`));
  }
}

/**
 * Update a single skill: fetch latest, compare hash, reinstall if changed.
 */
async function updateSingleSkill(
  skillName: string,
  entry: SkillEntry,
  targetDir: string,
  projectRoot: string,
  manifest: Manifest,
): Promise<{
  manifest: Manifest;
  status: "updated" | "up-to-date" | "failed";
}> {
  const spinner = ora(`Updating ${skillName}...`).start();

  try {
    if (entry.sourceType !== "github") {
      spinner.fail(
        `${skillName} - unsupported source type "${entry.sourceType}"`,
      );
      return { manifest, status: "failed" };
    }

    const githubSource = sourceToGitHub(entry.source);

    // Force-fetch from remote (ignore cache staleness)
    const cachePath = await fetchRepo(githubSource);

    // Resolve the skill from the fresh cache
    const resolved = await resolveSkill(skillName, cachePath);

    // Install to a temp location to compute the new hash
    const destPath = join(targetDir, skillName);

    // Remove old files and install new version
    await rm(destPath, { recursive: true, force: true });
    const newHash = await installSkill(resolved, targetDir);

    if (newHash === entry.computedHash) {
      spinner.succeed(`${chalk.bold(skillName)}: already up to date`);
      return { manifest, status: "up-to-date" };
    }

    // Update manifest entry
    const updatedEntry: SkillEntry = {
      ...entry,
      computedHash: newHash,
      installedAt: new Date().toISOString(),
    };

    manifest = addSkill(manifest, skillName, updatedEntry);
    await saveManifest(projectRoot, manifest);

    spinner.succeed(`${chalk.bold(skillName)}: updated`);

    // Re-run adapter installs
    const agents = entry.agents ?? [];
    if (agents.length > 0) {
      await runAdapterInstalls(projectRoot, agents, resolved);
    }

    return { manifest, status: "updated" };
  } catch (err) {
    spinner.fail(
      `${skillName} - ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return { manifest, status: "failed" };
  }
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [skill-name]")
    .alias("up")
    .description("Update installed skills to their latest versions")
    .option("-g, --global", "Update skills in ~/.agents/skills/")
    .action(async (skillName: string | undefined, opts: UpdateOptions) => {
      const projectRoot = process.cwd();
      const config = await loadConfig();
      const targetDir = opts.global
        ? join(homedir(), ".agents", "skills")
        : resolve(projectRoot, config.skillsDir);

      const manifest = await loadManifest(projectRoot);
      if (!manifest || Object.keys(manifest.skills).length === 0) {
        console.log(
          chalk.yellow(
            "No skills installed. Use ms add <owner/repo/skill-name> to install one.",
          ),
        );
        return;
      }

      // Determine which skills to update
      let skillsToUpdate: [string, SkillEntry][];

      if (skillName) {
        const entry = getSkill(manifest, skillName);
        if (!entry) {
          console.error(chalk.red(`Skill "${skillName}" is not installed.`));
          return;
        }
        skillsToUpdate = [[skillName, entry]];
      } else {
        skillsToUpdate = Object.entries(manifest.skills);
      }

      let updated = 0;
      let upToDate = 0;
      let failed = 0;
      let currentManifest = manifest;

      for (const [name, entry] of skillsToUpdate) {
        const result = await updateSingleSkill(
          name,
          entry,
          targetDir,
          projectRoot,
          currentManifest,
        );
        currentManifest = result.manifest;

        switch (result.status) {
          case "updated":
            updated++;
            break;
          case "up-to-date":
            upToDate++;
            break;
          case "failed":
            failed++;
            break;
        }
      }

      // Summary
      console.log("");
      const parts: string[] = [];
      if (updated > 0) parts.push(chalk.green(`${updated} updated`));
      if (upToDate > 0) parts.push(chalk.dim(`${upToDate} already up-to-date`));
      if (failed > 0) parts.push(chalk.red(`${failed} failed`));
      console.log(`Summary: ${parts.join(", ")}`);

      if (failed > 0) {
        process.exitCode = 1;
      }
    });
}
