import type { AgentId } from "@curiouslycory/shared-types";
import { AgentIdSchema } from "@curiouslycory/shared-types";

import { NativeAdapter } from "./native-adapter.js";
import type { AgentAdapter } from "./types.js";

/** Central registry mapping agent IDs to their adapter implementations. */
const adapterRegistry = new Map<AgentId, AgentAdapter>();

// Register all agents with NativeAdapter as the initial default.
// Specialized adapters (Copilot, Codex, Gemini) will replace these in later stories.
const nativeAgents: Array<{ id: AgentId; displayName: string }> = [
  { id: "claude-code", displayName: "Claude Code" },
  { id: "cursor", displayName: "Cursor" },
  { id: "cline", displayName: "Cline" },
  { id: "warp", displayName: "Warp" },
  { id: "amp", displayName: "Amp" },
  { id: "opencode", displayName: "OpenCode" },
  { id: "github-copilot", displayName: "GitHub Copilot" },
  { id: "codex", displayName: "Codex" },
  { id: "gemini-cli", displayName: "Gemini CLI" },
  { id: "kimi-code", displayName: "Kimi Code" },
];

for (const agent of nativeAgents) {
  adapterRegistry.set(agent.id, new NativeAdapter(agent.id, agent.displayName));
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
