import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import type {
  ArtifactCategory,
  Manifest,
  SkillEntry,
} from "@curiouslycory/shared-types";

import type { ResolvedSkill } from "../core/skill-resolver.js";
import { cloudSourceName, sourceToGitHub } from "../services/source-parser.js";
import {
  cloudDeployDir,
  createCloudClient,
  entryDeployDir,
  fetchCloudArtifact,
  materializeCloudArtifact,
} from "../services/cloud-source.js";
import { runAdapterInstalls } from "../core/adapter-runner.js";
import { loadConfig } from "../core/config.js";
import {
  addSkill,
  getSkill,
  loadManifest,
  saveManifest,
} from "../core/manifest.js";
import { replaceSkill } from "../core/skill-installer.js";
import { resolveSkill } from "../core/skill-resolver.js";
import { fetchRepo } from "../services/cache.js";

interface UpdateOptions {
  global?: boolean;
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
    // Resolve the latest version + its install target per source type. Cloud
    // (`@me`) entries fetch from the personal library over the API and deploy to
    // their (current, upstream) category's DEPLOY_PATH_MAP target; github
    // deploys to the skills dir.
    let resolved: ResolvedSkill;
    let installTarget = targetDir;
    let category: ArtifactCategory | undefined;
    let cleanup: (() => Promise<void>) | undefined;

    if (entry.sourceType === "github") {
      const githubSource = sourceToGitHub(entry.source);
      // Force-fetch from remote (ignore cache staleness)
      const cachePath = await fetchRepo(githubSource);
      resolved = await resolveSkill(skillName, cachePath);
    } else if (entry.sourceType === "cloud") {
      const { client } = await createCloudClient();
      const artifact = await fetchCloudArtifact(
        client,
        cloudSourceName(entry.source),
      );
      const materialized = await materializeCloudArtifact(artifact);
      resolved = materialized.resolved;
      cleanup = materialized.cleanup;
      category = materialized.category;
      installTarget = cloudDeployDir(projectRoot, category);
    } else {
      spinner.fail(
        `${skillName} - unsupported source type "${entry.sourceType}"`,
      );
      return { manifest, status: "failed" };
    }

    try {
      // Install the new version to compute its hash. The previous install
      // (wherever the manifest says it lives) is set aside rather than deleted,
      // so a failed install or manifest write restores it untouched.
      const previousPath = join(
        entryDeployDir(entry, projectRoot, targetDir),
        skillName,
      );
      const replacement = await replaceSkill(
        resolved,
        installTarget,
        previousPath,
      );
      const newHash = replacement.hash;
      const categoryChanged =
        category !== undefined && category !== entry.category;

      if (newHash === entry.computedHash && !categoryChanged) {
        await replacement.commit();
        spinner.succeed(`${chalk.bold(skillName)}: already up to date`);
        return { manifest, status: "up-to-date" };
      }

      // Update manifest entry
      const updatedEntry: SkillEntry = {
        ...entry,
        ...(category ? { category } : {}),
        computedHash: newHash,
        installedAt: new Date().toISOString(),
      };

      const nextManifest = addSkill(manifest, skillName, updatedEntry);
      try {
        await saveManifest(projectRoot, nextManifest);
      } catch (err) {
        await replacement.rollback();
        throw err;
      }
      await replacement.commit();
      manifest = nextManifest;

      spinner.succeed(`${chalk.bold(skillName)}: updated`);

      // Re-run adapter installs
      const agents = entry.agents ?? [];
      if (agents.length > 0) {
        await runAdapterInstalls(projectRoot, agents, resolved);
      }

      return { manifest, status: "updated" };
    } finally {
      await cleanup?.();
    }
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
