import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { db as dbInstance } from "@curiouslycory/db/client";
import type { Config } from "@curiouslycory/shared-types";
import { eq } from "@curiouslycory/db";
import { config, favorites } from "@curiouslycory/db/schema";

type DB = typeof dbInstance;

const CONFIG_DIR = join(homedir(), ".my-skills");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: Config = {
  defaultAgents: [],
  favoriteRepos: [],
  cacheDir: join(CONFIG_DIR, "cache"),
  skillsDir: ".agents/skills",
  autoDetectAgents: true,
  symlinkBehavior: "copy",
  serverUrl: "https://my-skills.dev",
};

/**
 * Reads the given user's config entries and favorites from DB, assembles a
 * Config object, and writes it to ~/.my-skills/config.json for CLI access.
 *
 * Scoped to `userId` so the local config file only ever reflects the calling
 * user's preferences (per-user correctness; the config file is local-only for
 * this slice and hosted gating is finalized later).
 */
export async function syncConfigToFile(db: DB, userId: string): Promise<void> {
  const configRows = await db
    .select()
    .from(config)
    .where(eq(config.userId, userId));
  const favoriteRows = await db
    .select()
    .from(favorites)
    .where(eq(favorites.userId, userId));

  const assembled: Config = { ...DEFAULT_CONFIG };

  for (const row of configRows) {
    switch (row.key) {
      case "defaultAgents":
        try {
          assembled.defaultAgents = JSON.parse(
            row.value,
          ) as Config["defaultAgents"];
        } catch {
          // keep default
        }
        break;
      case "cacheDir":
        assembled.cacheDir = row.value;
        break;
      case "skillsDir":
        assembled.skillsDir = row.value;
        break;
      case "autoDetectAgents":
        assembled.autoDetectAgents = row.value === "true";
        break;
      case "symlinkBehavior":
        if (row.value === "copy" || row.value === "symlink") {
          assembled.symlinkBehavior = row.value;
        }
        break;
    }
  }

  assembled.favoriteRepos = favoriteRows
    .filter((f) => f.type === "repo")
    .map((f) => f.repoUrl);

  await mkdir(CONFIG_DIR, { recursive: true });
  const tmpPath = CONFIG_PATH + ".tmp";
  await writeFile(tmpPath, JSON.stringify(assembled, null, 2) + "\n", "utf-8");
  await rename(tmpPath, CONFIG_PATH);
}
