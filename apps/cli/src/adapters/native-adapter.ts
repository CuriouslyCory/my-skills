import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

import type { AgentId } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

/**
 * Default adapter that copies skill files into .agents/skills/<name>/.
 * Used by agents that natively support the .agents/skills directory structure.
 */
export class NativeAdapter implements AgentAdapter {
  constructor(
    public readonly id: AgentId,
    public readonly displayName: string,
  ) {}

  async detect(_projectRoot: string): Promise<boolean> {
    // Native adapters are always available
    return true;
  }

  async install(
    projectRoot: string,
    skill: AdapterSkillEntry,
  ): Promise<void> {
    const targetDir = join(this.getSkillsPath(projectRoot), skill.name);
    await cp(skill.sourcePath, targetDir, { recursive: true });
  }

  async remove(projectRoot: string, skillName: string): Promise<void> {
    const targetDir = join(this.getSkillsPath(projectRoot), skillName);
    await rm(targetDir, { recursive: true, force: true });
  }

  async sync(
    projectRoot: string,
    skills: AdapterSkillEntry[],
  ): Promise<void> {
    for (const skill of skills) {
      await this.install(projectRoot, skill);
    }
  }

  getSkillsPath(projectRoot: string): string {
    return join(projectRoot, ".agents", "skills");
  }
}
