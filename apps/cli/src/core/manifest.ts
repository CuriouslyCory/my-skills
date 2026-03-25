import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Manifest, SkillEntry } from "@curiouslycory/shared-types";
import { ManifestSchema } from "@curiouslycory/shared-types";
import chalk from "chalk";

const MANIFEST_FILE = ".my-skills.json";

export async function loadManifest(
  projectRoot: string,
): Promise<Manifest | null> {
  const manifestPath = join(projectRoot, MANIFEST_FILE);

  let content: string;
  try {
    content = await readFile(manifestPath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    console.warn(
      chalk.yellow(`Warning: ${manifestPath} contains invalid JSON, ignoring.`),
    );
    return null;
  }

  try {
    return ManifestSchema.parse(raw);
  } catch {
    console.warn(
      chalk.yellow(
        `Warning: ${manifestPath} does not match expected schema, ignoring.`,
      ),
    );
    return null;
  }
}

export async function saveManifest(
  projectRoot: string,
  manifest: Manifest,
): Promise<void> {
  const manifestPath = join(projectRoot, MANIFEST_FILE);
  const tmpPath = manifestPath + ".tmp";

  await writeFile(tmpPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  await rename(tmpPath, manifestPath);
}

export function addSkill(
  manifest: Manifest,
  name: string,
  entry: SkillEntry,
): Manifest {
  return {
    ...manifest,
    skills: { ...manifest.skills, [name]: entry },
  };
}

export function removeSkill(manifest: Manifest, name: string): Manifest {
  const { [name]: _, ...rest } = manifest.skills;
  return { ...manifest, skills: rest };
}

export function getSkill(
  manifest: Manifest,
  name: string,
): SkillEntry | undefined {
  return manifest.skills[name];
}
