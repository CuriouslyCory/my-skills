import { lstat, mkdir, readdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";

import type { AgentId } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

/** Map of agent IDs to their tool-specific skills directory (relative to project root). */
const AGENT_SKILLS_DIR: Partial<Record<AgentId, string>> = {
  "claude-code": ".claude/skills",
  cursor: ".cursor/skills",
  cline: ".cline/skills",
  warp: ".warp/skills",
  amp: ".amp/skills",
  opencode: ".opencode/skills",
  "kimi-code": ".kimi/skills",
};

/**
 * Adapter that creates symlinks from agent-specific directories
 * to .agents/skills/<name>/. Only used when the user explicitly
 * configures symlinkBehavior: "symlink" in config.
 */
export class SymlinkAdapter implements AgentAdapter {
  constructor(
    public readonly id: AgentId,
    public readonly displayName: string,
  ) {}

  async detect(_projectRoot: string): Promise<boolean> {
    return true;
  }

  async install(
    projectRoot: string,
    skill: AdapterSkillEntry,
  ): Promise<void> {
    const agentDir = this.getSkillsPath(projectRoot);
    await mkdir(agentDir, { recursive: true });

    const linkPath = join(agentDir, skill.name);
    const targetPath = join(projectRoot, ".agents", "skills", skill.name);

    // Remove existing symlink if present
    try {
      const stat = await lstat(linkPath);
      if (stat.isSymbolicLink()) {
        await unlink(linkPath);
      }
    } catch {
      // Link doesn't exist - that's fine
    }

    await symlink(targetPath, linkPath, "dir");
  }

  async remove(projectRoot: string, skillName: string): Promise<void> {
    const linkPath = join(this.getSkillsPath(projectRoot), skillName);

    try {
      const stat = await lstat(linkPath);
      if (stat.isSymbolicLink()) {
        await unlink(linkPath);
      }
    } catch {
      // Link doesn't exist - nothing to remove
    }
  }

  async sync(
    projectRoot: string,
    skills: AdapterSkillEntry[],
  ): Promise<void> {
    const agentDir = this.getSkillsPath(projectRoot);

    // Remove existing symlinks in the agent skills directory
    try {
      const entries = await readdir(agentDir);
      for (const entry of entries) {
        const entryPath = join(agentDir, entry);
        const stat = await lstat(entryPath);
        if (stat.isSymbolicLink()) {
          await unlink(entryPath);
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    // Create symlinks for all current skills
    for (const skill of skills) {
      await this.install(projectRoot, skill);
    }
  }

  getSkillsPath(projectRoot: string): string {
    const relativeDir = AGENT_SKILLS_DIR[this.id];
    if (!relativeDir) {
      // Fallback for agents without a specific directory
      return join(projectRoot, ".agents", "skills");
    }
    return join(projectRoot, relativeDir);
  }
}
