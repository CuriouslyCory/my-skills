export type { AdapterSkillEntry, AgentAdapter } from "./types.js";
export { NativeAdapter } from "./native.js";
export { SymlinkAdapter } from "./symlink.js";
export { adapterRegistry, getAdapter, getEnabledAdapters } from "./registry.js";
export { AGENT_MARKERS, detectAgents, resolveAgents } from "./detect.js";
