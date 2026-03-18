import type { AgentId } from "@curiouslycory/shared-types";
import { AGENT_NATIVE_SUPPORT, AgentIdSchema } from "@curiouslycory/shared-types";

import { CopilotAdapter } from "./copilot.js";
import { NativeAdapter } from "./native.js";
import type { AgentAdapter } from "./types.js";

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

// Register native agents (no-op adapters for agents that read .agents/skills/ directly)
for (const id of AgentIdSchema.options) {
  if (AGENT_NATIVE_SUPPORT[id]) {
    adapterRegistry.set(
      id,
      new NativeAdapter(id, AGENT_DISPLAY_NAMES[id]),
    );
  }
}

// Register specialized adapters for non-native agents
adapterRegistry.set(
  "github-copilot",
  new CopilotAdapter(),
);

// Remaining non-native agents get NativeAdapter as placeholder until specialized adapters replace them
// (Codex, Gemini adapters in later stories)
for (const id of AgentIdSchema.options) {
  if (!adapterRegistry.has(id)) {
    adapterRegistry.set(
      id,
      new NativeAdapter(id, AGENT_DISPLAY_NAMES[id]),
    );
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
