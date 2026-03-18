import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { parseSkillFrontmatter } from "@curiouslycory/shared-types";
import type { SkillFrontmatter } from "@curiouslycory/shared-types";

export interface ResolvedSkill {
  name: string;
  sourcePath: string;
  frontmatter: SkillFrontmatter;
  content: string;
  files: string[];
}

export async function resolveSkill(
  skillName: string,
  cachePath: string,
): Promise<ResolvedSkill> {
  const match = await findSkillByName(cachePath, skillName);
  if (!match) {
    throw new Error(`Skill "${skillName}" not found in repository`);
  }

  const skillMdPath = join(match.path, "SKILL.md");
  const rawContent = await readFile(skillMdPath, "utf-8");
  const { frontmatter } = parseSkillFrontmatter(rawContent);
  const files = await collectAllFiles(match.path);

  return {
    name: frontmatter.name,
    sourcePath: match.path,
    frontmatter,
    content: rawContent,
    files,
  };
}

async function findSkillByName(
  repoPath: string,
  skillName: string,
): Promise<{ path: string } | null> {
  return walkForSkillByName(repoPath, skillName);
}

async function walkForSkillByName(
  currentPath: string,
  skillName: string,
): Promise<{ path: string } | null> {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const fullPath = join(currentPath, entry.name);

    if (entry.isFile() && entry.name === "SKILL.md") {
      try {
        const content = await readFile(fullPath, "utf-8");
        const { frontmatter } = parseSkillFrontmatter(content);
        if (frontmatter.name === skillName) {
          return { path: currentPath };
        }
      } catch {
        // Skip files with invalid frontmatter
      }
    } else if (entry.isDirectory()) {
      const result = await walkForSkillByName(fullPath, skillName);
      if (result) return result;
    }
  }

  return null;
}

async function collectAllFiles(
  dirPath: string,
  prefix = "",
): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectAllFiles(
        join(dirPath, entry.name),
        relativePath,
      );
      files.push(...nested);
    } else {
      files.push(relativePath);
    }
  }

  return files.sort();
}
