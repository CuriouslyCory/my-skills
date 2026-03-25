import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Manifest } from "@curiouslycory/shared-types";
import chalk from "chalk";

import { saveManifest } from "./manifest.js";

const SKILLS_LOCK_FILE = "skills-lock.json";
const MANIFEST_FILE = ".my-skills.json";

interface SkillsLockEntry {
  source: string;
  sourceType: string;
  computedHash: string;
}

interface SkillsLock {
  version: number;
  skills: Record<string, SkillsLockEntry>;
}

export async function migrateFromSkillsLock(
  projectRoot: string,
): Promise<Manifest | null> {
  const manifestPath = join(projectRoot, MANIFEST_FILE);
  const lockPath = join(projectRoot, SKILLS_LOCK_FILE);

  // If .my-skills.json already exists, no migration needed
  try {
    await access(manifestPath);
    return null;
  } catch {
    // .my-skills.json doesn't exist, continue
  }

  // Check if skills-lock.json exists
  let lockContent: string;
  try {
    lockContent = await readFile(lockPath, "utf-8");
  } catch {
    return null;
  }

  let lock: SkillsLock;
  try {
    lock = JSON.parse(lockContent) as SkillsLock;
  } catch {
    console.warn(
      chalk.yellow(`Warning: corrupt skills-lock.json in ${projectRoot}, skipping migration`),
    );
    return null;
  }

  const now = new Date().toISOString();

  const manifest: Manifest = {
    version: 1,
    agents: [],
    skills: Object.fromEntries(
      Object.entries(lock.skills).map(([name, entry]) => {
        // Default legacy 'gitlab' sourceType to 'github'
        const sourceType =
          entry.sourceType === "gitlab" ? "github" : entry.sourceType;
        return [
          name,
          {
            source: entry.source,
            sourceType: sourceType as "github" | "url" | "local",
            computedHash: entry.computedHash,
            installedAt: now,
          },
        ];
      }),
    ),
  };

  await saveManifest(projectRoot, manifest);

  console.log("Migrated skills-lock.json -> .my-skills.json");

  return manifest;
}
