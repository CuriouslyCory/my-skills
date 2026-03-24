import type { AgentId } from "@curiouslycory/shared-types";
import { AgentIdSchema } from "@curiouslycory/shared-types";

import type { AgentAdapter } from "./types.js";
import { CodexAdapter } from "./codex.js";
import { CopilotAdapter } from "./copilot.js";
import { GeminiAdapter } from "./gemini.js";
import { NativeAdapter } from "./native.js";
import { SymlinkAdapter } from "./symlink.js";

/** Central registry mapping agent IDs to their adapter implementations. */
const adapterRegistry = new Map<AgentId, AgentAdapter>();

// Display names for all agents
const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  cline: "Cline",
  warp: "Warp",
  amp: "Amp",
  opencode: "OpenCode",
  "github-copilot": "GitHub Copilot",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  "kimi-code": "Kimi Code",
};

// Agents that have their own skills directory need symlinks from
// .<agent>/skills/<name> → .agents/skills/<name>
const SYMLINK_AGENTS: AgentId[] = [
  "claude-code",
  "cursor",
  "cline",
  "warp",
  "amp",
  "opencode",
  "kimi-code",
];

for (const id of SYMLINK_AGENTS) {
  adapterRegistry.set(id, new SymlinkAdapter(id, AGENT_DISPLAY_NAMES[id]));
}

// Register specialized adapters for agents with custom formats
adapterRegistry.set("github-copilot", new CopilotAdapter());
adapterRegistry.set("codex", new CodexAdapter());
adapterRegistry.set("gemini-cli", new GeminiAdapter());

// Remaining agents get NativeAdapter as fallback
for (const id of AgentIdSchema.options) {
  if (!adapterRegistry.has(id)) {
    adapterRegistry.set(id, new NativeAdapter(id, AGENT_DISPLAY_NAMES[id]));
  }
}

// Verify all agent IDs are registered
for (const id of AgentIdSchema.options) {
  if (!adapterRegistry.has(id)) {
    throw new Error(`Missing adapter registration for agent: ${id}`);
  }
}

/** Get the adapter for a specific agent ID. */
export function getAdapter(id: AgentId): AgentAdapter {
  const adapter = adapterRegistry.get(id);
  if (!adapter) {
    throw new Error(`No adapter registered for agent: ${id}`);
  }
  return adapter;
}

/** Get adapters for the given agent IDs. */
export function getEnabledAdapters(agents: AgentId[]): AgentAdapter[] {
  return agents.map((id) => getAdapter(id));
}

export { adapterRegistry };
