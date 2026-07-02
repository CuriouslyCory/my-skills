import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";

import type {
  AgentId,
  Manifest,
  SkillEntry,
} from "@curiouslycory/shared-types";
import { AgentIdSchema } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry } from "../adapters/index.js";
import type { ResolvedSkill } from "../core/skill-resolver.js";
import { detectAgents, getEnabledAdapters } from "../adapters/index.js";
import {
  cloudDeployDir,
  createCloudClient,
  fetchCloudArtifact,
  materializeCloudArtifact,
  normalizeCategory,
} from "../services/cloud-source.js";
import { loadConfig } from "../core/config.js";
import { addSkill, loadManifest, saveManifest } from "../core/manifest.js";
import { computeSkillHash } from "../core/skill-hasher.js";
import { installSkill } from "../core/skill-installer.js";
import { resolveSkill } from "../core/skill-resolver.js";
import { fetchRepo } from "../services/cache.js";
import { cloudSourceName, sourceToGitHub } from "../services/source-parser.js";

interface ApplyOptions {
  frozen?: boolean;
  json?: boolean;
  hook?: boolean;
}

/** Action decided for a single skill during reconciliation. */
export type SkillAction = "install" | "update" | "noop";

/** Outcome of executing (or planning) reconciliation for a single skill. */
interface SkillResult {
  name: string;
  source: string;
  /** The action that was taken (or would be taken in --frozen mode). */
  action: SkillAction | "failed";
  /** True in --frozen mode when this skill is not in sync with the manifest. */
  wouldChange?: boolean;
  error?: string;
}

interface ApplyOutcome {
  status: "applied" | "skipped" | "frozen-drift" | "error";
  reason?: string;
  results: SkillResult[];
  exitCode: number;
}

/**
 * Resolve the project root. Prefer INIT_CWD (set by npm/pnpm during lifecycle
 * scripts such as postinstall) so a hook running inside node_modules/my-skills
 * targets the host project rather than the package's own directory.
 */
function resolveProjectRoot(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

/**
 * Decide what action a skill needs by comparing the installed files on disk to
 * the hash recorded in the manifest. Reads disk only - never hits the network -
 * so an in-sync project reconciles fully offline.
 */
export async function planSkillAction(
  entry: SkillEntry,
  destPath: string,
): Promise<SkillAction> {
  const exists = await stat(destPath)
    .then(() => true)
    .catch(() => false);

  if (!exists) return "install";

  try {
    const localHash = await computeSkillHash(destPath);
    return localHash === entry.computedHash ? "noop" : "update";
  } catch {
    // Unreadable/corrupt install - treat as needing a reinstall.
    return "update";
  }
}

/** A resolved entry plus an optional cleanup for any temp materialization. */
interface ResolvedEntry {
  resolved: ResolvedSkill;
  cleanup?: () => Promise<void>;
}

/**
 * Resolve a manifest entry to an installable skill. Supports unauthenticated
 * `github` (shallow clone via cache) and `local` (filesystem path) sources, plus
 * `cloud` (`@me`) sources fetched from the personal library over the API. Cloud
 * resolution needs a token; `createCloudClient` throws `AuthRequiredError` with a
 * clear message when none is available, which the caller records as a failure.
 */
async function resolveEntrySkill(
  skillName: string,
  entry: SkillEntry,
  projectRoot: string,
): Promise<ResolvedEntry> {
  if (entry.sourceType === "github") {
    const githubSource = sourceToGitHub(entry.source);
    const cachePath = await fetchRepo(githubSource);
    return { resolved: await resolveSkill(skillName, cachePath) };
  }

  if (entry.sourceType === "local") {
    const localPath = resolve(projectRoot, entry.source);
    return { resolved: await resolveSkill(skillName, localPath) };
  }

  if (entry.sourceType === "cloud") {
    const { client } = await createCloudClient();
    const artifact = await fetchCloudArtifact(
      client,
      cloudSourceName(entry.source),
    );
    const { resolved, cleanup } = await materializeCloudArtifact(artifact);
    return { resolved, cleanup };
  }

  throw new Error(`unsupported source type "${entry.sourceType}"`);
}

/**
 * The reconcile target directory for an entry. Cloud entries deploy to their
 * category's DEPLOY_PATH_MAP target; github/local skills use the default
 * skills directory.
 */
function entryTargetDir(
  entry: SkillEntry,
  projectRoot: string,
  defaultTargetDir: string,
): string {
  if (entry.sourceType === "cloud") {
    return cloudDeployDir(projectRoot, normalizeCategory(entry.category));
  }
  return defaultTargetDir;
}

/**
 * Resolve the agents to target without prompting. Precedence: manifest agents,
 * then global config defaults, then agents detected from project markers.
 */
async function resolveAgentsNonInteractive(
  manifest: Manifest,
  defaultAgents: AgentId[],
  projectRoot: string,
): Promise<AgentId[]> {
  const manifestAgents = manifest.agents.filter(
    (a): a is AgentId => AgentIdSchema.safeParse(a).success,
  );
  if (manifestAgents.length > 0) return manifestAgents;
  if (defaultAgents.length > 0) return defaultAgents;
  return detectAgents(projectRoot);
}

/**
 * Run each enabled agent adapter for a skill. Adapter failures are warnings and
 * never fail reconciliation (symlink/copy is best-effort).
 */
async function runAdapterInstalls(
  projectRoot: string,
  agents: AgentId[],
  skill: AdapterSkillEntry,
  quiet: boolean,
): Promise<void> {
  const adapters = getEnabledAdapters(agents);
  const deployed: string[] = [];

  for (const adapter of adapters) {
    try {
      await adapter.install(projectRoot, skill);
      deployed.push(adapter.displayName);
    } catch (err) {
      if (!quiet) {
        console.warn(
          chalk.yellow(
            `  Warning: ${adapter.displayName} adapter failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          ),
        );
      }
    }
  }

  if (deployed.length > 0 && !quiet) {
    console.log(chalk.dim(`  Deployed to: ${deployed.join(", ")}`));
  }
}

/**
 * Build a lightweight adapter entry for an already-installed skill so its
 * symlinks can be (re)created without touching the skill's source.
 */
function adapterEntryForInstalled(
  skillName: string,
  destPath: string,
): AdapterSkillEntry {
  return {
    name: skillName,
    sourcePath: destPath,
    frontmatter: { name: skillName, description: "" },
    content: "",
    files: [],
  };
}

/**
 * Core reconciliation. Pure of process concerns (no exit codes / printing of
 * the final summary) so it can be unit tested directly.
 */
export async function reconcile(
  manifest: Manifest,
  targetDir: string,
  projectRoot: string,
  opts: { frozen: boolean; quiet: boolean },
): Promise<{ results: SkillResult[]; manifest: Manifest }> {
  const config = await loadConfig();
  const fallbackAgents = await resolveAgentsNonInteractive(
    manifest,
    config.defaultAgents,
    projectRoot,
  );

  const results: SkillResult[] = [];
  let currentManifest = manifest;

  for (const [name, entry] of Object.entries(manifest.skills)) {
    const entryTarget = entryTargetDir(entry, projectRoot, targetDir);
    const destPath = join(entryTarget, name);
    const agents = entry.agents ?? fallbackAgents;

    let action: SkillAction;
    try {
      action = await planSkillAction(entry, destPath);
    } catch (err) {
      results.push({
        name,
        source: entry.source,
        action: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      continue;
    }

    if (action === "noop") {
      if (!opts.frozen) {
        await runAdapterInstalls(
          projectRoot,
          agents,
          adapterEntryForInstalled(name, destPath),
          opts.quiet,
        );
      }
      results.push({ name, source: entry.source, action: "noop" });
      continue;
    }

    // install or update would change the working tree.
    if (opts.frozen) {
      results.push({
        name,
        source: entry.source,
        action,
        wouldChange: true,
      });
      continue;
    }

    try {
      const { resolved, cleanup } = await resolveEntrySkill(
        name,
        entry,
        projectRoot,
      );
      try {
        if (action === "update") {
          await rm(destPath, { recursive: true, force: true });
        }
        const newHash = await installSkill(resolved, entryTarget);

        // No commit pinning exists yet, so an upstream change can leave the
        // freshly installed hash different from the manifest. Record it so the
        // next run sees an in-sync tree (idempotency).
        if (newHash !== entry.computedHash) {
          const updatedEntry: SkillEntry = {
            ...entry,
            computedHash: newHash,
            installedAt: new Date().toISOString(),
          };
          currentManifest = addSkill(currentManifest, name, updatedEntry);
        }

        await runAdapterInstalls(projectRoot, agents, resolved, opts.quiet);
        results.push({ name, source: entry.source, action });
      } finally {
        await cleanup?.();
      }
    } catch (err) {
      results.push({
        name,
        source: entry.source,
        action: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { results, manifest: currentManifest };
}

/**
 * Run the full apply flow: resolve root, honor hook-safety skips, reconcile,
 * persist manifest drift, and compute the process exit code.
 */
export async function runApply(opts: ApplyOptions): Promise<ApplyOutcome> {
  const frozen = opts.frozen ?? false;
  const hook = opts.hook ?? false;
  const quiet = opts.json ?? false;

  // Hook-safety skip conditions (postinstall context only).
  if (hook) {
    if (process.env.MY_SKILLS_SKIP === "1") {
      return skipped("MY_SKILLS_SKIP=1 set");
    }
    if (process.env.CI && process.env.MY_SKILLS_CI !== "1") {
      return skipped("running under CI (set MY_SKILLS_CI=1 to force)");
    }
  }

  const projectRoot = resolveProjectRoot();
  const config = await loadConfig();
  const targetDir = resolve(projectRoot, config.skillsDir);

  let manifest: Manifest | null;
  try {
    manifest = await loadManifest(projectRoot);
  } catch (err) {
    if (hook) {
      return skipped(
        `could not read manifest: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    throw err;
  }

  if (!manifest || Object.keys(manifest.skills).length === 0) {
    return skipped("no skills in .my-skills.json");
  }

  const { results, manifest: nextManifest } = await reconcile(
    manifest,
    targetDir,
    projectRoot,
    { frozen, quiet },
  );

  // Persist manifest drift (only when we actually installed/updated).
  if (!frozen && nextManifest !== manifest) {
    await saveManifest(projectRoot, nextManifest);
  }

  const changed = results.filter(
    (r) => r.action === "install" || r.action === "update",
  ).length;
  const failed = results.filter((r) => r.action === "failed").length;

  let exitCode: number;
  let status: ApplyOutcome["status"];

  if (frozen) {
    exitCode = changed > 0 ? 2 : 0;
    status = changed > 0 ? "frozen-drift" : "applied";
  } else if (failed > 0) {
    // Hook mode never breaks the host package manager's install.
    exitCode = hook ? 0 : 1;
    status = "error";
  } else {
    exitCode = 0;
    status = "applied";
  }

  return { status, results, exitCode };
}

function skipped(reason: string): ApplyOutcome {
  return { status: "skipped", reason, results: [], exitCode: 0 };
}

function printHuman(outcome: ApplyOutcome, frozen: boolean): void {
  if (outcome.status === "skipped") {
    console.log(chalk.dim(`ms apply: skipped (${outcome.reason})`));
    return;
  }

  const installed = outcome.results.filter((r) => r.action === "install");
  const updated = outcome.results.filter((r) => r.action === "update");
  const inSync = outcome.results.filter((r) => r.action === "noop");
  const failed = outcome.results.filter((r) => r.action === "failed");

  if (frozen) {
    const drift = [...installed, ...updated];
    if (drift.length === 0) {
      console.log(chalk.green("In sync: no changes needed."));
    } else {
      console.log(
        chalk.red(`Out of sync: ${drift.length} skill(s) would change.`),
      );
      for (const r of drift) {
        console.log(
          chalk.yellow(
            `  ${r.action === "install" ? "missing" : "changed"}: ${r.name}`,
          ),
        );
      }
    }
    return;
  }

  for (const r of installed) {
    console.log(chalk.green(`  installed ${chalk.bold(r.name)} (${r.source})`));
  }
  for (const r of updated) {
    console.log(chalk.green(`  updated ${chalk.bold(r.name)} (${r.source})`));
  }
  for (const r of failed) {
    console.log(chalk.red(`  failed ${chalk.bold(r.name)}: ${r.error ?? ""}`));
  }

  const parts: string[] = [];
  if (installed.length > 0)
    parts.push(chalk.green(`${installed.length} installed`));
  if (updated.length > 0) parts.push(chalk.green(`${updated.length} updated`));
  if (inSync.length > 0) parts.push(chalk.dim(`${inSync.length} in sync`));
  if (failed.length > 0) parts.push(chalk.red(`${failed.length} failed`));
  console.log("");
  console.log(
    `Summary: ${parts.length > 0 ? parts.join(", ") : "nothing to do"}`,
  );
}

function printJson(outcome: ApplyOutcome): void {
  const summary = {
    installed: outcome.results.filter((r) => r.action === "install").length,
    updated: outcome.results.filter((r) => r.action === "update").length,
    inSync: outcome.results.filter((r) => r.action === "noop").length,
    failed: outcome.results.filter((r) => r.action === "failed").length,
  };
  console.log(
    JSON.stringify(
      {
        status: outcome.status,
        reason: outcome.reason,
        exitCode: outcome.exitCode,
        summary,
        skills: outcome.results,
      },
      null,
      2,
    ),
  );
}

export function registerApplyCommand(program: Command): void {
  program
    .command("apply")
    .description(
      "Reconcile installed skills to .my-skills.json (non-interactive, idempotent)",
    )
    .option(
      "--frozen",
      "Verify only: exit 2 if anything would change, make no modifications",
    )
    .option("--json", "Output results as machine-readable JSON")
    .option(
      "--hook",
      "Postinstall hook mode: skip safely and never fail the host install",
    )
    .action(async (opts: ApplyOptions) => {
      const outcome = await runApply(opts);

      if (opts.json) {
        printJson(outcome);
      } else {
        printHuman(outcome, opts.frozen ?? false);
      }

      if (outcome.exitCode !== 0) {
        process.exitCode = outcome.exitCode;
      }
    });
}
