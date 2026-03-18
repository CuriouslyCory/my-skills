import { cp, mkdir } from "node:fs/promises";
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
