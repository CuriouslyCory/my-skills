import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Manifest } from "@curiouslycory/shared-types";

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

  const lock: SkillsLock = JSON.parse(lockContent) as SkillsLock;
  const now = new Date().toISOString();

  const manifest: Manifest = {
    version: 1,
    agents: [],
    skills: Object.fromEntries(
      Object.entries(lock.skills).map(([name, entry]) => [
        name,
        {
          source: entry.source,
          sourceType: entry.sourceType as "github" | "gitlab" | "url" | "local",
          computedHash: entry.computedHash,
          installedAt: now,
        },
      ]),
    ),
  };

  await saveManifest(projectRoot, manifest);

  console.log("Migrated skills-lock.json -> .my-skills.json");

  return manifest;
}
