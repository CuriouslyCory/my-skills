import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { AdapterSkillEntry, AgentAdapter } from "./types.js";

const COPILOT_FILE = ".github/copilot-instructions.md";
const MANAGED_START = "<!-- my-skills:start -->";
const MANAGED_END = "<!-- my-skills:end -->";

function skillStart(name: string): string {
  return `<!-- my-skills:${name}:start -->`;
}

function skillEnd(name: string): string {
  return `<!-- my-skills:${name}:end -->`;
}

/**
 * Build the full managed section content from a list of skill blocks.
 */
function buildManagedSection(skillBlocks: string[]): string {
  if (skillBlocks.length === 0) {
    return `${MANAGED_START}\n${MANAGED_END}`;
  }
  return `${MANAGED_START}\n${skillBlocks.join("\n")}\n${MANAGED_END}`;
}

/**
 * Build a single skill block with start/end markers.
 */
function buildSkillBlock(skill: AdapterSkillEntry): string {
  return `${skillStart(skill.name)}\n${skill.content.trim()}\n${skillEnd(skill.name)}`;
}

/**
 * Parse the file content into: before managed section, managed content, after managed section.
 * If no managed section exists, returns the whole content as "before" with empty managed/after.
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

  const before = content.slice(0, startIdx);
  const managed = content.slice(startIdx + MANAGED_START.length, endIdx);
  const after = content.slice(endIdx + MANAGED_END.length);

  return { before, managed, after };
}

/**
 * Read copilot-instructions.md or return empty string if it doesn't exist.
 */
async function readCopilotFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Write copilot-instructions.md, creating parent directories if needed.
 */
async function writeCopilotFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

/**
 * Adapter for GitHub Copilot that manages skill content in
 * .github/copilot-instructions.md using HTML comment markers.
 */
export class CopilotAdapter implements AgentAdapter {
  readonly id = "github-copilot" as const;
  readonly displayName = "GitHub Copilot";

  async detect(projectRoot: string): Promise<boolean> {
    try {
      await access(join(projectRoot, COPILOT_FILE));
      return true;
    } catch {
      // Fall back to checking for .github/ directory
      try {
        await access(join(projectRoot, ".github"));
        return true;
      } catch {
        return false;
      }
    }
  }

  async install(projectRoot: string, skill: AdapterSkillEntry): Promise<void> {
    const filePath = join(projectRoot, COPILOT_FILE);
    const existing = await readCopilotFile(filePath);
    const block = buildSkillBlock(skill);

    if (!existing) {
      // No file yet — create with managed section
      await writeCopilotFile(filePath, buildManagedSection([block]) + "\n");
      return;
    }

    const { before, managed, after } = parseSections(existing);

    if (!managed && !existing.includes(MANAGED_START)) {
      // File exists but no managed section — append managed section
      const sep = existing.endsWith("\n") ? "\n" : "\n\n";
      await writeCopilotFile(
        filePath,
        existing + sep + buildManagedSection([block]) + "\n",
      );
      return;
    }

    // Managed section exists — check if this skill is already present
    const sStart = skillStart(skill.name);
    const sEnd = skillEnd(skill.name);

    if (managed.includes(sStart)) {
      // Replace existing skill block
      const startIdx = managed.indexOf(sStart);
      const endIdx = managed.indexOf(sEnd);
      if (endIdx !== -1) {
        const updatedManaged =
          managed.slice(0, startIdx) +
          block +
          managed.slice(endIdx + sEnd.length);
        await writeCopilotFile(
          filePath,
          before + MANAGED_START + updatedManaged + MANAGED_END + after,
        );
        return;
      }
    }

    // Add new skill block to managed section
    const trimmedManaged = managed.trimEnd();
    const newManaged = trimmedManaged ? trimmedManaged + "\n" + block : block;
    await writeCopilotFile(
      filePath,
      before + MANAGED_START + "\n" + newManaged + "\n" + MANAGED_END + after,
    );
  }

  async remove(projectRoot: string, skillName: string): Promise<void> {
    const filePath = join(projectRoot, COPILOT_FILE);
    const existing = await readCopilotFile(filePath);

    if (!existing) return;

    const { before, managed, after } = parseSections(existing);
    if (!managed && !existing.includes(MANAGED_START)) return;

    const sStart = skillStart(skillName);
    const sEnd = skillEnd(skillName);

    const startIdx = managed.indexOf(sStart);
    if (startIdx === -1) return;

    const endIdx = managed.indexOf(sEnd);
    if (endIdx === -1) return;

    // Remove the skill block and any surrounding blank line
    let updatedManaged =
      managed.slice(0, startIdx) + managed.slice(endIdx + sEnd.length);

    // Clean up extra newlines
    updatedManaged = updatedManaged.replace(/\n{3,}/g, "\n");

    await writeCopilotFile(
      filePath,
      before +
        MANAGED_START +
        (updatedManaged.trim() ? "\n" + updatedManaged.trim() + "\n" : "\n") +
        MANAGED_END +
        after,
    );
  }

  async sync(projectRoot: string, skills: AdapterSkillEntry[]): Promise<void> {
    const filePath = join(projectRoot, COPILOT_FILE);
    const existing = await readCopilotFile(filePath);
    const blocks = skills.map((s) => buildSkillBlock(s));
    const managedSection = buildManagedSection(blocks);

    if (!existing) {
      await writeCopilotFile(filePath, managedSection + "\n");
      return;
    }

    const { before, after } = parseSections(existing);

    if (!existing.includes(MANAGED_START)) {
      // No existing managed section — append
      const sep = existing.endsWith("\n") ? "\n" : "\n\n";
      await writeCopilotFile(filePath, existing + sep + managedSection + "\n");
      return;
    }

    // Replace entire managed section
    await writeCopilotFile(filePath, before + managedSection + after);
  }

  getSkillsPath(projectRoot: string): string {
    return join(projectRoot, ".github");
  }
}
