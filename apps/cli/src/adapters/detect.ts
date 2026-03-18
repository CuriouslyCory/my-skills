import { access } from "node:fs/promises";
import { join } from "node:path";

import type { AgentId } from "@curiouslycory/shared-types";
import { AgentIdSchema } from "@curiouslycory/shared-types";
import chalk from "chalk";

import { loadConfig, saveConfig } from "../core/config.js";
import { loadManifest, saveManifest } from "../core/manifest.js";

/** Marker files/directories that indicate an agent is present in a project. */
const AGENT_MARKERS: Record<AgentId, string[]> = {
  "claude-code": [".claude", "CLAUDE.md"],
  cursor: [".cursor", ".cursorrules"],
  cline: [".cline", ".clinerules"],
  warp: [".warp"],
  amp: [".amp", "AGENTS.md"],
  opencode: [".opencode"],
  "github-copilot": [".github/copilot-instructions.md"],
  codex: [".codex"],
  "gemini-cli": [".gemini", "GEMINI.md"],
  "kimi-code": [".kimi"],
};

/** Check if a path exists (file or directory). */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which AI agents are present in a project by checking for marker
 * files and directories.
 */
export async function detectAgents(projectRoot: string): Promise<AgentId[]> {
  const detected: AgentId[] = [];

  for (const id of AgentIdSchema.options) {
    const markers = AGENT_MARKERS[id];
    for (const marker of markers) {
      if (await pathExists(join(projectRoot, marker))) {
        detected.push(id);
        break;
      }
    }
  }

  return detected;
}

/**
 * Resolve the agents to use for a skill installation.
 *
 * On first run (no agents in manifest or config), presents an interactive
 * checkbox prompt with detected agents pre-selected. Saves the selection
 * to both the manifest and global config.
 *
 * On subsequent runs, returns agents from config.defaultAgents.
 */
export async function resolveAgents(
  projectRoot: string,
): Promise<AgentId[]> {
  const config = await loadConfig();

  // If config already has defaultAgents, use those
  if (config.defaultAgents.length > 0) {
    return config.defaultAgents;
  }

  // Check manifest for saved agents
  const manifest = await loadManifest(projectRoot);
  if (manifest && manifest.agents.length > 0) {
    return manifest.agents as AgentId[];
  }

  // First run: detect and prompt
  const detected = await detectAgents(projectRoot);

  const { default: checkbox } = await import("@inquirer/checkbox");

  const choices = AgentIdSchema.options.map((id) => ({
    name: id,
    value: id,
    checked: detected.includes(id),
  }));

  const selected = await checkbox<AgentId>({
    message: "Select AI agents to configure for this project:",
    choices,
  });

  // Save to global config
  config.defaultAgents = selected;
  await saveConfig(config);

  // Save to manifest
  const currentManifest = manifest ?? {
    version: 1 as const,
    agents: [] as string[],
    skills: {},
  };
  currentManifest.agents = selected;
  await saveManifest(projectRoot, currentManifest);

  console.log(
    chalk.cyan(
      "Run `ms config set defaultAgents ...` to change defaults",
    ),
  );

  return selected;
}

export { AGENT_MARKERS };
