import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { db as dbInstance } from "@curiouslycory/db/client";
import { eq } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";
import {
  CATEGORY_DIR_MAP,
  parseSkillFrontmatter,
} from "@curiouslycory/shared-types";

type DB = typeof dbInstance;

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Walk a base directory for immediate subdirectories containing SKILL.md.
 */
async function walkDirs(
  baseDir: string,
): Promise<{ dirPath: string; skillMdPath: string }[]> {
  const results: { dirPath: string; skillMdPath: string }[] = [];
  if (!existsSync(baseDir)) return results;

  const entries = await readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(baseDir, entry.name);
    const skillMdPath = join(dirPath, "SKILL.md");
    if (existsSync(skillMdPath)) {
      results.push({ dirPath, skillMdPath });
    }
  }
  return results;
}

/**
 * Scan the filesystem for skills and artifacts, then sync them to the database.
 *
 * Walks skills/SKILL.md and artifacts/CATEGORY/SKILL.md,
 * upserts each found item into the skills DB table matched on dirPath,
 * and removes DB records whose dirPath no longer exists on disk.
 */
export async function scanAndSync(
  repoPath: string,
  db: DB,
): Promise<ScanResult> {
  let added = 0;
  let updated = 0;
  let removed = 0;

  const seenDirPaths = new Set<string>();

  // --- Skills: skills/*/SKILL.md ---
  const skillsDir = join(repoPath, "skills");
  const skillDirs = await walkDirs(skillsDir);

  for (const { dirPath, skillMdPath } of skillDirs) {
    const relDirPath = relative(repoPath, dirPath);
    seenDirPaths.add(relDirPath);

    const raw = await readFile(skillMdPath, "utf-8");
    let frontmatter;
    let body: string;
    try {
      const parsed = parseSkillFrontmatter(raw);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch {
      continue;
    }

    const existing = await db.query.skills.findFirst({
      where: eq(skills.dirPath, relDirPath),
    });

    if (existing) {
      await db
        .update(skills)
        .set({
          name: frontmatter.name,
          description: frontmatter.description,
          content: body,
          tags: JSON.stringify([]),
          updatedAt: new Date(),
        })
        .where(eq(skills.id, existing.id));
      updated++;
    } else {
      await db.insert(skills).values({
        name: frontmatter.name,
        description: frontmatter.description,
        content: body,
        tags: JSON.stringify([]),
        dirPath: relDirPath,
        category: "skill",
      });
      added++;
    }
  }

  // --- Artifacts: artifacts/<category>/*/SKILL.md ---
  const artifactCategories = ["agent", "prompt", "claudemd"] as const;

  for (const category of artifactCategories) {
    const artifactDir = join(repoPath, "artifacts", CATEGORY_DIR_MAP[category]);
    const artifactDirs = await walkDirs(artifactDir);

    for (const { dirPath, skillMdPath } of artifactDirs) {
      const relDirPath = relative(repoPath, dirPath);
      seenDirPaths.add(relDirPath);

      const raw = await readFile(skillMdPath, "utf-8");
      let frontmatter;
      let body: string;
      try {
        const parsed = parseSkillFrontmatter(raw);
        frontmatter = parsed.frontmatter;
        body = parsed.body;
      } catch {
        continue;
      }

      const existing = await db.query.skills.findFirst({
        where: eq(skills.dirPath, relDirPath),
      });

      if (existing) {
        await db
          .update(skills)
          .set({
            name: frontmatter.name,
            description: frontmatter.description,
            content: body,
            tags: JSON.stringify([]),
            category,
            updatedAt: new Date(),
          })
          .where(eq(skills.id, existing.id));
        updated++;
      } else {
        await db.insert(skills).values({
          name: frontmatter.name,
          description: frontmatter.description,
          content: body,
          tags: JSON.stringify([]),
          dirPath: relDirPath,
          category,
        });
        added++;
      }
    }
  }

  // --- Remove stale DB entries whose dirPath no longer exists on disk ---
  const allDbRows = await db.select().from(skills);
  for (const row of allDbRows) {
    if (row.dirPath && !seenDirPaths.has(row.dirPath)) {
      await db.delete(skills).where(eq(skills.id, row.id));
      removed++;
    }
  }

  return { added, updated, removed };
}
