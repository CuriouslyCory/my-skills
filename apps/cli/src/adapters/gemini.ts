import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { stringify } from "smol-toml";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

const COMMANDS_DIR = ".gemini/commands";
const GEMINI_MD = "GEMINI.md";
const MANAGED_START = "<!-- my-skills:start -->";
const MANAGED_END = "<!-- my-skills:end -->";

/**
 * Build a TOML command file for a skill.
 */
function buildCommandToml(skill: AdapterSkillEntry): string {
  return (
    stringify({
      name: skill.name,
      description: skill.frontmatter.description,
      instructions: skill.content.trim(),
    }) + "\n"
  );
}

/**
 * Build a reference line for GEMINI.md.
 */
function buildSkillRef(skill: AdapterSkillEntry): string {
  return `- **${skill.name}**: ${skill.frontmatter.description} (command: \`${skill.name}\`)`;
}

/**
 * Build the full managed section for GEMINI.md.
 */
function buildManagedSection(refs: string[]): string {
  if (refs.length === 0) {
    return `${MANAGED_START}\n${MANAGED_END}`;
  }
  return `${MANAGED_START}\n${refs.join("\n")}\n${MANAGED_END}`;
}

/**
 * Parse GEMINI.md into before/managed/after sections.
 */
function parseSections(content: string): {
  before: string;
  managed: string;
  after: string;
} {
  const startIdx = content.indexOf(MANAGED_START);
  const endIdx = content.indexOf(MANAGED_END);

  if (startIdx === -1 || endIdx === -1) {
    return { before: content, managed: "", after: "" };
  }

  return {
    before: content.slice(0, startIdx),
    managed: content.slice(startIdx + MANAGED_START.length, endIdx),
    after: content.slice(endIdx + MANAGED_END.length),
  };
}

/**
 * Read a file or return empty string if it doesn't exist.
 */
async function readFileOr(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Write a file, creating parent directories if needed.
 */
async function writeFileEnsureDir(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

/**
 * Add a skill reference to the managed section of GEMINI.md.
 */
async function addToGeminiMd(
  projectRoot: string,
  skill: AdapterSkillEntry,
): Promise<void> {
  const filePath = join(projectRoot, GEMINI_MD);
  const existing = await readFileOr(filePath);
  const ref = buildSkillRef(skill);

  if (!existing) {
    await writeFileEnsureDir(filePath, buildManagedSection([ref]) + "\n");
    return;
  }

  if (!existing.includes(MANAGED_START)) {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    await writeFileEnsureDir(
      filePath,
      existing + sep + buildManagedSection([ref]) + "\n",
    );
    return;
  }

  const { before, managed, after } = parseSections(existing);
  const trimmedManaged = managed.trimEnd();
  const newManaged = trimmedManaged ? trimmedManaged + "\n" + ref : ref;
  await writeFileEnsureDir(
    filePath,
    before + MANAGED_START + "\n" + newManaged + "\n" + MANAGED_END + after,
  );
}

/**
 * Remove a skill reference from the managed section of GEMINI.md.
 */
async function removeFromGeminiMd(
  projectRoot: string,
  skillName: string,
): Promise<void> {
  const filePath = join(projectRoot, GEMINI_MD);
  const existing = await readFileOr(filePath);

  if (!existing.includes(MANAGED_START)) return;

  const { before, managed, after } = parseSections(existing);

  // Filter out lines containing this skill's reference
  const lines = managed.split("\n").filter(
    (line) => !line.includes(`**${skillName}**`),
  );

  const updatedManaged = lines.filter((l) => l.trim()).join("\n");
  await writeFileEnsureDir(
    filePath,
    before +
      MANAGED_START +
      (updatedManaged ? "\n" + updatedManaged + "\n" : "\n") +
      MANAGED_END +
      after,
  );
}

/**
 * Sync all skill references in GEMINI.md.
 */
async function syncGeminiMd(
  projectRoot: string,
  skills: AdapterSkillEntry[],
): Promise<void> {
  const filePath = join(projectRoot, GEMINI_MD);
  const existing = await readFileOr(filePath);
  const refs = skills.map((s) => buildSkillRef(s));
  const managedSection = buildManagedSection(refs);

  if (!existing) {
    await writeFileEnsureDir(filePath, managedSection + "\n");
    return;
  }

  if (!existing.includes(MANAGED_START)) {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    await writeFileEnsureDir(filePath, existing + sep + managedSection + "\n");
    return;
  }

  const { before, after } = parseSections(existing);
  await writeFileEnsureDir(filePath, before + managedSection + after);
}

/**
 * Adapter for Google Gemini CLI that manages:
 * 1. Per-skill TOML command files in .gemini/commands/<skill-name>.toml
 * 2. Skill references in GEMINI.md using <!-- my-skills:start/end --> markers
 */
export class GeminiAdapter implements AgentAdapter {
  readonly id = "gemini-cli" as const;
  readonly displayName = "Gemini CLI";

  async detect(projectRoot: string): Promise<boolean> {
    try {
      await access(join(projectRoot, COMMANDS_DIR));
      return true;
    } catch {
      try {
        await access(join(projectRoot, ".gemini"));
        return true;
      } catch {
        try {
          await access(join(projectRoot, GEMINI_MD));
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  async install(
    projectRoot: string,
    skill: AdapterSkillEntry,
  ): Promise<void> {
    // Write TOML command file
    const tomlPath = join(projectRoot, COMMANDS_DIR, `${skill.name}.toml`);
    await writeFileEnsureDir(tomlPath, buildCommandToml(skill));

    // Add reference to GEMINI.md
    await addToGeminiMd(projectRoot, skill);
  }

  async remove(projectRoot: string, skillName: string): Promise<void> {
    // Remove TOML command file
    const tomlPath = join(projectRoot, COMMANDS_DIR, `${skillName}.toml`);
    try {
      await rm(tomlPath);
    } catch {
      // File may not exist
    }

    // Remove reference from GEMINI.md
    await removeFromGeminiMd(projectRoot, skillName);
  }

  async sync(
    projectRoot: string,
    skills: AdapterSkillEntry[],
  ): Promise<void> {
    // Write all TOML command files
    for (const skill of skills) {
      const tomlPath = join(projectRoot, COMMANDS_DIR, `${skill.name}.toml`);
      await writeFileEnsureDir(tomlPath, buildCommandToml(skill));
    }

    // Sync GEMINI.md references
    await syncGeminiMd(projectRoot, skills);
  }

  getSkillsPath(projectRoot: string): string {
    return join(projectRoot, COMMANDS_DIR);
  }
}
