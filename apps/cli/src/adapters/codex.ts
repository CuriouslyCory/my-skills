import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse, stringify } from "smol-toml";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

const CODEX_FILE = ".codex/config.toml";

type TomlValue = string | number | boolean | TomlValue[] | { [key: string]: TomlValue };
type TomlRecord = Record<string, TomlValue>;

/**
 * Read .codex/config.toml or return empty string if it doesn't exist.
 */
async function readTomlFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Write .codex/config.toml, creating parent directories if needed.
 */
async function writeTomlFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

/**
 * Build a skill section object for TOML.
 */
function buildSkillSection(skill: AdapterSkillEntry): TomlRecord {
  return {
    description: skill.frontmatter.description,
    instructions: skill.content.trim(),
  };
}

/**
 * Adapter for OpenAI Codex that manages skill content in
 * .codex/config.toml using [skills.<name>] TOML sections.
 */
export class CodexAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  readonly displayName = "Codex";

  async detect(projectRoot: string): Promise<boolean> {
    try {
      await access(join(projectRoot, CODEX_FILE));
      return true;
    } catch {
      try {
        await access(join(projectRoot, ".codex"));
        return true;
      } catch {
        return false;
      }
    }
  }

  async install(
    projectRoot: string,
    skill: AdapterSkillEntry,
  ): Promise<void> {
    const filePath = join(projectRoot, CODEX_FILE);
    const raw = await readTomlFile(filePath);

    const doc = raw ? (parse(raw) as Record<string, TomlValue>) : {};

    // Ensure skills table exists
    if (!doc.skills || typeof doc.skills !== "object" || Array.isArray(doc.skills)) {
      doc.skills = {};
    }

    (doc.skills as Record<string, TomlValue>)[skill.name] = buildSkillSection(skill);

    await writeTomlFile(filePath, stringify(doc) + "\n");
  }

  async remove(projectRoot: string, skillName: string): Promise<void> {
    const filePath = join(projectRoot, CODEX_FILE);
    const raw = await readTomlFile(filePath);

    if (!raw) return;

    const doc = raw ? (parse(raw) as Record<string, TomlValue>) : {};

    if (
      !doc.skills ||
      typeof doc.skills !== "object" ||
      Array.isArray(doc.skills)
    ) {
      return;
    }

    const skills = doc.skills as Record<string, TomlValue>;
    if (!(skillName in skills)) return;

    delete skills[skillName];

    await writeTomlFile(filePath, stringify(doc) + "\n");
  }

  async sync(
    projectRoot: string,
    skills: AdapterSkillEntry[],
  ): Promise<void> {
    const filePath = join(projectRoot, CODEX_FILE);
    const raw = await readTomlFile(filePath);

    const doc = raw ? (parse(raw) as Record<string, TomlValue>) : {};

    // Replace entire skills table
    const newSkills: Record<string, TomlValue> = {};
    for (const skill of skills) {
      newSkills[skill.name] = buildSkillSection(skill);
    }
    doc.skills = newSkills;

    await writeTomlFile(filePath, stringify(doc) + "\n");
  }

  getSkillsPath(projectRoot: string): string {
    return join(projectRoot, ".codex");
  }
}
