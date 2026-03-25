import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Config } from "@curiouslycory/shared-types";

// Create temp dir synchronously so it's available at module load time.
// CONFIG_DIR = join(homedir(), ".my-skills") is computed at module scope in config-sync.ts,
// so the mock must return a valid path before any import chain touches that module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tempHome = vi.hoisted(() => {
  // Must use require() — ESM imports aren't available inside vi.hoisted
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-sync-test-"));
});

const mockHomeDir = vi.hoisted(() => vi.fn().mockReturnValue(tempHome));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: mockHomeDir };
});

// Mock the DB client to prevent real SQLite initialization at import time
vi.mock("@curiouslycory/db/client", () => ({
  db: {},
}));

// We do NOT mock config-sync — we're testing it
const { createTestCaller } = await import("../../test-utils");

const configPath = join(tempHome, ".my-skills", "config.json");

describe("syncConfigToFile", () => {
  let rawDb: Database.Database;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    rawDb = ctx.rawDb;
  });

  beforeEach(() => {
    rawDb.exec("DELETE FROM config");
    rawDb.exec("DELETE FROM favorites");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(tempHome, { recursive: true, force: true });
  });

  async function getDb() {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const schema = await import("@curiouslycory/db/schema");
    return drizzle({ client: rawDb, schema });
  }

  async function readConfig(): Promise<Config> {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as Config;
  }

  it("writes default config when DB is empty", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    await syncConfigToFile(db);

    const cfg = await readConfig();
    expect(cfg.defaultAgents).toEqual([]);
    expect(cfg.favoriteRepos).toEqual([]);
    expect(cfg.skillsDir).toBe(".agents/skills");
    expect(cfg.autoDetectAgents).toBe(true);
    expect(cfg.symlinkBehavior).toBe("copy");
  });

  it("assembles config from DB rows", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    rawDb.exec(`
      INSERT INTO config (id, key, value) VALUES ('1', 'cacheDir', '/tmp/custom-cache');
      INSERT INTO config (id, key, value) VALUES ('2', 'skillsDir', 'custom/skills');
      INSERT INTO config (id, key, value) VALUES ('3', 'autoDetectAgents', 'false');
      INSERT INTO config (id, key, value) VALUES ('4', 'symlinkBehavior', 'symlink');
    `);

    await syncConfigToFile(db);

    const cfg = await readConfig();
    expect(cfg.cacheDir).toBe("/tmp/custom-cache");
    expect(cfg.skillsDir).toBe("custom/skills");
    expect(cfg.autoDetectAgents).toBe(false);
    expect(cfg.symlinkBehavior).toBe("symlink");
  });

  it("assembles defaultAgents from JSON config value", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    rawDb.exec(`
      INSERT INTO config (id, key, value) VALUES ('1', 'defaultAgents', '["claude-code","cursor"]');
    `);

    await syncConfigToFile(db);

    const cfg = await readConfig();
    expect(cfg.defaultAgents).toEqual(["claude-code", "cursor"]);
  });

  it("handles invalid JSON in defaultAgents config value", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    rawDb.exec(`
      INSERT INTO config (id, key, value) VALUES ('1', 'defaultAgents', 'not-json');
    `);

    await syncConfigToFile(db);

    // Should keep default empty array when JSON parse fails
    const cfg = await readConfig();
    expect(cfg.defaultAgents).toEqual([]);
  });

  it("includes favorite repos from favorites table", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    rawDb.exec(`
      INSERT INTO favorites (id, repo_url, name, type) VALUES ('f1', 'https://github.com/owner/repo1', 'repo1', 'repo');
      INSERT INTO favorites (id, repo_url, name, type) VALUES ('f2', 'https://github.com/owner/repo2', 'repo2', 'repo');
      INSERT INTO favorites (id, repo_url, name, type) VALUES ('f3', 'https://github.com/owner/repo3', 'skill1', 'skill');
    `);

    await syncConfigToFile(db);

    const cfg = await readConfig();
    // Only 'repo' type favorites should appear in favoriteRepos
    expect(cfg.favoriteRepos).toEqual([
      "https://github.com/owner/repo1",
      "https://github.com/owner/repo2",
    ]);
  });

  it("ignores invalid symlinkBehavior values", async () => {
    const { syncConfigToFile } = await import("../config-sync");
    const db = await getDb();

    rawDb.exec(`
      INSERT INTO config (id, key, value) VALUES ('1', 'symlinkBehavior', 'invalid-value');
    `);

    await syncConfigToFile(db);

    const cfg = await readConfig();
    // Should keep default "copy" when value is invalid
    expect(cfg.symlinkBehavior).toBe("copy");
  });
});
