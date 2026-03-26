import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { migrateFromSkillsLock } from "../../src/core/migration.js";

describe("migration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "migration-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns null when .my-skills.json already exists", async () => {
    await writeFile(
      join(testDir, ".my-skills.json"),
      JSON.stringify({ version: 1, agents: [], skills: {} }),
    );
    await writeFile(
      join(testDir, "skills-lock.json"),
      JSON.stringify({ version: 1, skills: {} }),
    );

    const result = await migrateFromSkillsLock(testDir);
    expect(result).toBeNull();
  });

  it("returns null when neither file exists", async () => {
    const result = await migrateFromSkillsLock(testDir);
    expect(result).toBeNull();
  });

  it("migrates skills-lock.json to .my-skills.json", async () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const lockData = {
      version: 1,
      skills: {
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc123",
        },
        "another-skill": {
          source: "./local/path",
          sourceType: "local",
          computedHash: "def456",
        },
      },
    };
    await writeFile(
      join(testDir, "skills-lock.json"),
      JSON.stringify(lockData),
    );

    const result = await migrateFromSkillsLock(testDir);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(1);
    expect(result?.skills["test-skill"]?.source).toBe("owner/repo");
    expect(result?.skills["test-skill"]?.sourceType).toBe("github");
    expect(result?.skills["test-skill"]?.computedHash).toBe("abc123");
    expect(result?.skills["test-skill"]?.installedAt).toBeDefined();
    expect(result?.skills["another-skill"]?.sourceType).toBe("local");

    // Verify file was written
    const content = await readFile(join(testDir, ".my-skills.json"), "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(
      (parsed.skills as Record<string, unknown>)["test-skill"],
    ).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("returns null when only .my-skills.json exists (no lock file)", async () => {
    await writeFile(
      join(testDir, ".my-skills.json"),
      JSON.stringify({ version: 1, agents: [], skills: {} }),
    );

    const result = await migrateFromSkillsLock(testDir);
    expect(result).toBeNull();
  });

  describe("error paths", () => {
    it("returns null and logs warning for corrupt skills-lock.json (invalid JSON)", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      await writeFile(join(testDir, "skills-lock.json"), "not-valid-json{{{");

      const result = await migrateFromSkillsLock(testDir);
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("corrupt skills-lock.json"),
      );

      warnSpy.mockRestore();
    });

    it("defaults legacy 'gitlab' sourceType to 'github' during migration", async () => {
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);

      const lockData = {
        version: 1,
        skills: {
          "gitlab-skill": {
            source: "owner/repo",
            sourceType: "gitlab",
            computedHash: "hash123",
          },
        },
      };
      await writeFile(
        join(testDir, "skills-lock.json"),
        JSON.stringify(lockData),
      );

      const result = await migrateFromSkillsLock(testDir);
      expect(result).not.toBeNull();
      expect(result?.skills["gitlab-skill"]?.sourceType).toBe("github");

      logSpy.mockRestore();
    });

    it("produces correct .my-skills.json shape with version, installedAt, and sourceType", async () => {
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);

      const lockData = {
        version: 1,
        skills: {
          "my-skill": {
            source: "owner/repo",
            sourceType: "github",
            computedHash: "abc123",
          },
        },
      };
      await writeFile(
        join(testDir, "skills-lock.json"),
        JSON.stringify(lockData),
      );

      const result = await migrateFromSkillsLock(testDir);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.skills["my-skill"]?.sourceType).toBe("github");
      expect(result?.skills["my-skill"]?.installedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
      expect(result?.skills["my-skill"]?.computedHash).toBe("abc123");
      expect(result?.skills["my-skill"]?.source).toBe("owner/repo");

      // Verify persisted file shape
      const content = await readFile(
        join(testDir, ".my-skills.json"),
        "utf-8",
      );
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.agents)).toBe(true);

      logSpy.mockRestore();
    });
  });
});
