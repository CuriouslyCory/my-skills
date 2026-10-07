import { randomBytes } from "node:crypto";
import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { ResolvedSkill } from "./skill-resolver.js";
import { computeSkillHash } from "./skill-hasher.js";

export async function installSkill(
  skill: ResolvedSkill,
  targetDir: string,
): Promise<string> {
  const destPath = join(targetDir, skill.name);

  await mkdir(destPath, { recursive: true });
  await cp(skill.sourcePath, destPath, { recursive: true });

  const hash = await computeSkillHash(destPath);
  return hash;
}

/** A replacement install that can still be committed or rolled back. */
export interface SkillReplacement {
  /** Content hash of the freshly installed skill. */
  hash: string;
  /** Discards the previous install (call once the new one is recorded). */
  commit: () => Promise<void>;
  /** Removes the new install and restores the previous one in place. */
  rollback: () => Promise<void>;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

/**
 * Replace an installed skill without a window where it is simply gone. Any
 * existing install at `previousPath` (and at the new destination, when the
 * skill is moving between deploy dirs) is renamed aside before installing, then
 * restored automatically if the install throws. On success the caller decides:
 * `commit()` once the manifest reflects the new install, or `rollback()` if
 * recording it failed.
 */
export async function replaceSkill(
  skill: ResolvedSkill,
  targetDir: string,
  previousPath: string = join(targetDir, skill.name),
): Promise<SkillReplacement> {
  const destPath = join(targetDir, skill.name);
  const displaced = [...new Set([previousPath, destPath])];
  const suffix = `.ms-backup-${randomBytes(4).toString("hex")}`;

  const backups: { original: string; backup: string }[] = [];
  for (const original of displaced) {
    if (await pathExists(original)) {
      const backup = original + suffix;
      await rename(original, backup);
      backups.push({ original, backup });
    }
  }

  const rollback = async () => {
    await rm(destPath, { recursive: true, force: true });
    for (const { original, backup } of backups) {
      await rename(backup, original);
    }
  };

  let hash: string;
  try {
    hash = await installSkill(skill, targetDir);
  } catch (err) {
    await rollback();
    throw err;
  }

  return {
    hash,
    commit: async () => {
      for (const { backup } of backups) {
        await rm(backup, { recursive: true, force: true });
      }
    },
    rollback,
  };
}
