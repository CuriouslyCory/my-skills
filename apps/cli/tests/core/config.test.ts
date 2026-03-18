import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to mock the module-level constants that depend on homedir()
// since config.ts computes CONFIG_DIR and CONFIG_PATH at import time.
let testDir: string;
let configDir: string;
let configPath: string;

// Mock homedir to point to our temp directory
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testDir,
  };
});

describe("config", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "config-test-"));
    configDir = join(testDir, ".my-skills");
    configPath = join(configDir, "config.json");

    // Clear module cache to re-evaluate module-level constants with new testDir
    vi.resetModules();

    // Clear env overrides
    delete process.env.MY_SKILLS_CACHE_DIR;
    delete process.env.MY_SKILLS_SKILLS_DIR;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("loadConfig", () => {
    it("returns defaults when no config file exists", async () => {
      const { loadConfig, DEFAULT_CONFIG } = await import(
        "../../src/core/config.js"
      );
      const config = await loadConfig();
      expect(config.defaultAgents).toEqual(DEFAULT_CONFIG.defaultAgents);
      expect(config.autoDetectAgents).toBe(true);
      expect(config.symlinkBehavior).toBe("copy");
      expect(config.skillsDir).toBe(".agents/skills");
    });

    it("loads config from file and merges with defaults", async () => {
      await mkdir(configDir, { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify({ skillsDir: "custom/skills", autoDetectAgents: false }),
      );

      const { loadConfig } = await import("../../src/core/config.js");
      const config = await loadConfig();
      expect(config.skillsDir).toBe("custom/skills");
      expect(config.autoDetectAgents).toBe(false);
      // Defaults are still present for unset fields
      expect(config.symlinkBehavior).toBe("copy");
    });

    it("applies MY_SKILLS_CACHE_DIR env override", async () => {
      process.env.MY_SKILLS_CACHE_DIR = "/tmp/custom-cache";

      const { loadConfig } = await import("../../src/core/config.js");
      const config = await loadConfig();
      expect(config.cacheDir).toBe("/tmp/custom-cache");
    });

    it("applies MY_SKILLS_SKILLS_DIR env override", async () => {
      process.env.MY_SKILLS_SKILLS_DIR = "custom/dir";

      const { loadConfig } = await import("../../src/core/config.js");
      const config = await loadConfig();
      expect(config.skillsDir).toBe("custom/dir");
    });

    it("handles invalid JSON in config file gracefully", async () => {
      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, "not json{{{");

      const { loadConfig } = await import("../../src/core/config.js");
      const config = await loadConfig();
      // Should fall back to defaults
      expect(config.autoDetectAgents).toBe(true);
    });
  });

  describe("saveConfig", () => {
    it("creates config directory and writes config file", async () => {
      const { saveConfig, loadConfig, DEFAULT_CONFIG } = await import(
        "../../src/core/config.js"
      );

      const config = { ...DEFAULT_CONFIG, skillsDir: "saved/skills" };
      await saveConfig(config);

      // Verify it was written
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.skillsDir).toBe("saved/skills");
    });

    it("overwrites existing config file", async () => {
      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, JSON.stringify({ skillsDir: "old" }));

      const { saveConfig, DEFAULT_CONFIG } = await import(
        "../../src/core/config.js"
      );

      await saveConfig({ ...DEFAULT_CONFIG, skillsDir: "new" });
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.skillsDir).toBe("new");
    });
  });
});
