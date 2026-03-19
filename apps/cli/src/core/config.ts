import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { ConfigSchema } from "@curiouslycory/shared-types";
import type { Config } from "@curiouslycory/shared-types";

const CONFIG_DIR = join(homedir(), ".my-skills");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: Config = {
  defaultAgents: [],
  favoriteRepos: [],
  cacheDir: join(CONFIG_DIR, "cache"),
  skillsDir: ".agents/skills",
  autoDetectAgents: true,
  symlinkBehavior: "copy",
};

export async function loadConfig(): Promise<Config> {
  let raw: Record<string, unknown> = {};

  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist or is invalid - use defaults
  }

  const merged = { ...DEFAULT_CONFIG, ...raw };
  const config = ConfigSchema.parse(merged);

  // Environment variable overrides
  if (process.env.MY_SKILLS_CACHE_DIR) {
    config.cacheDir = process.env.MY_SKILLS_CACHE_DIR;
  }
  if (process.env.MY_SKILLS_SKILLS_DIR) {
    config.skillsDir = process.env.MY_SKILLS_SKILLS_DIR;
  }

  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const tmpPath = CONFIG_PATH + ".tmp";
  await writeFile(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await rename(tmpPath, CONFIG_PATH);
}

export { CONFIG_DIR, CONFIG_PATH, DEFAULT_CONFIG };
