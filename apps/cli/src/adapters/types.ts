import type { AgentId, SkillFrontmatter } from "@curiouslycory/shared-types";

/**
 * A resolved skill ready for adapter installation.
 */
export interface AdapterSkillEntry {
  name: string;
  sourcePath: string;
  frontmatter: SkillFrontmatter;
  content: string;
  files: string[];
}

/**
 * Interface that all agent adapters must implement.
 */
export interface AgentAdapter {
  /** The agent this adapter handles */
  id: AgentId;
  /** Human-readable name for display */
  displayName: string;
  /** Check if this agent is configured/present in the project */
  detect(projectRoot: string): Promise<boolean>;
  /** Install a skill for this agent */
  install(projectRoot: string, skill: AdapterSkillEntry): Promise<void>;
  /** Remove a skill by name for this agent */
  remove(projectRoot: string, skillName: string): Promise<void>;
  /** Sync all skills for this agent */
  sync(projectRoot: string, skills: AdapterSkillEntry[]): Promise<void>;
  /** Get the directory path where this agent stores skills */
  getSkillsPath(projectRoot: string): string;
}
