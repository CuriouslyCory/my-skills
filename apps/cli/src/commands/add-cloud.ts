import checkbox from "@inquirer/checkbox";
import chalk from "chalk";
import ora from "ora";

import type {
  AgentId,
  Manifest,
  SkillEntry,
} from "@curiouslycory/shared-types";

import type { AdapterSkillEntry } from "../adapters/index.js";
import type { ApiClient } from "../core/api-client.js";
import type { CloudSource } from "../services/source-parser.js";
import { getEnabledAdapters, resolveAgents } from "../adapters/index.js";
import {
  AuthRequiredError,
  friendlyApiErrorMessage,
} from "../core/api-client.js";
import { addSkill, getSkill, saveManifest } from "../core/manifest.js";
import { installSkill } from "../core/skill-installer.js";
import {
  cloudDeployDir,
  cloudManifestSource,
  createCloudClient,
  fetchCloudArtifact,
  listCloudLibrary,
  materializeCloudArtifact,
} from "../services/cloud-source.js";

/** The subset of `ms add` options the cloud path reads. */
export interface CloudAddOptions {
  skill?: string;
  yes?: boolean;
  list?: boolean;
}

/**
 * Run adapter.install() for each enabled agent. Adapter failures are warnings and
 * never fail the overall install (best-effort symlink/copy), matching the
 * github/local paths.
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
 * Install a single artifact from the personal library through the existing
 * pipeline: fetch content over the API, materialize a SKILL.md, install it into
 * the category's DEPLOY_PATH_MAP target, record a `cloud` manifest entry with the
 * computed hash, then run the agent adapters.
 */
export async function installSingleCloudArtifact(
  client: ApiClient,
  name: string,
  projectRoot: string,
  manifest: Manifest,
  agents: AgentId[],
): Promise<Manifest> {
  const spinner = ora(`Installing ${name}...`).start();
  try {
    const artifact = await fetchCloudArtifact(client, name);
    const { resolved, category, cleanup } =
      await materializeCloudArtifact(artifact);

    try {
      const targetDir = cloudDeployDir(projectRoot, category);
      const hash = await installSkill(resolved, targetDir);

      const entry: SkillEntry = {
        source: cloudManifestSource(name),
        sourceType: "cloud",
        category,
        computedHash: hash,
        installedAt: new Date().toISOString(),
        agents,
        ...(artifact.version ? { version: artifact.version } : {}),
      };

      manifest = addSkill(manifest, name, entry);
      await saveManifest(projectRoot, manifest);

      spinner.succeed(
        `Installed ${chalk.bold(name)} ${chalk.dim(`(@me, ${category})`)}`,
      );

      await runAdapterInstalls(projectRoot, agents, resolved);
    } finally {
      await cleanup();
    }

    return manifest;
  } catch (err) {
    spinner.fail(`Failed to install ${name}`);
    process.exitCode = 1;
    console.error(
      chalk.red(err instanceof Error ? err.message : "Unknown error occurred"),
    );
    return manifest;
  }
}

function parseSkillNames(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Handle `ms add @me` (browse the whole library) and `ms add @me/<name>` (install
 * one). Reuses the existing interactive checkbox picker for browsing.
 */
export async function addFromCloud(
  cloud: CloudSource,
  opts: CloudAddOptions,
  projectRoot: string,
  manifest: Manifest,
  agents: AgentId[] | undefined,
): Promise<void> {
  let client: ApiClient;
  let serverUrl: string;
  try {
    ({ client, serverUrl } = await createCloudClient());
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      console.error(chalk.red(err.message));
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const spinner = ora("Fetching your library...").start();
  let items;
  try {
    items = await listCloudLibrary(client);
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to reach your library");
    console.error(chalk.red(friendlyApiErrorMessage(err, serverUrl)));
    process.exitCode = 1;
    return;
  }

  if (items.length === 0) {
    console.log(
      chalk.yellow(
        "Your personal library is empty. Create skills/agents in the web app first.",
      ),
    );
    return;
  }

  // --list: print the library without installing.
  if (opts.list) {
    console.log(chalk.bold("\nYour personal library (@me):\n"));
    for (const item of items) {
      console.log(
        `  ${chalk.green(item.name)}  ${chalk.dim(item.description)} ${chalk.blue(`[${item.category}]`)}`,
      );
    }
    console.log("");
    return;
  }

  // Determine which artifacts to install.
  const available = new Set(items.map((i) => i.name));
  let names: string[];
  if (cloud.name) {
    if (!available.has(cloud.name)) {
      console.error(
        chalk.red(`"@me/${cloud.name}" was not found in your library.`),
      );
      process.exitCode = 1;
      return;
    }
    names = [cloud.name];
  } else if (opts.skill === "*") {
    names = items.map((i) => i.name);
  } else if (opts.skill) {
    names = parseSkillNames(opts.skill);
  } else if (opts.yes) {
    names = items.map((i) => i.name);
  } else {
    const selected = await checkbox({
      message: "Select artifacts to install from your library:",
      choices: items.map((item) => ({
        name: `${item.name} - ${chalk.dim(item.description)} ${chalk.blue(`[${item.category}]`)}`,
        value: item.name,
      })),
    });
    if (selected.length === 0) {
      console.log(chalk.yellow("No artifacts selected."));
      return;
    }
    names = selected;
  }

  const resolvedAgents = agents ?? (await resolveAgents(projectRoot));

  for (const name of names) {
    if (getSkill(manifest, name)) {
      console.log(
        chalk.yellow(
          `"${name}" is already installed. Use ${chalk.bold("ms update")} to update it.`,
        ),
      );
      continue;
    }
    manifest = await installSingleCloudArtifact(
      client,
      name,
      projectRoot,
      manifest,
      resolvedAgents,
    );
  }
}
