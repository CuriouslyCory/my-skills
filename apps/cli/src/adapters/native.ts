import { join } from "node:path";

import type { AgentId } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

/**
 * No-op adapter for agents that natively read .agents/skills/ directly.
 * Install/remove/sync are no-ops because the core skill-installer handles
 * file placement and the agent reads from the shared directory.
 */
export class NativeAdapter implements AgentAdapter {
  constructor(
    public readonly id: AgentId,
    public readonly displayName: string,
  ) {}

  detect(_projectRoot: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  async install(
    _projectRoot: string,
    _skill: AdapterSkillEntry,
  ): Promise<void> {
    // No-op: agent reads .agents/skills/ directly
  }

  async remove(_projectRoot: string, _skillName: string): Promise<void> {
    // No-op: core installer handles file removal
  }

  async sync(
    _projectRoot: string,
    _skills: AdapterSkillEntry[],
  ): Promise<void> {
    // No-op: agent reads .agents/skills/ directly
  }

  getSkillsPath(projectRoot: string): string {
    return join(projectRoot, ".agents", "skills");
  }
}
