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
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    await writeFile(join(testDir, "skills-lock.json"), JSON.stringify(lockData));

    const result = await migrateFromSkillsLock(testDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.skills["test-skill"]!.source).toBe("owner/repo");
    expect(result!.skills["test-skill"]!.sourceType).toBe("github");
    expect(result!.skills["test-skill"]!.computedHash).toBe("abc123");
    expect(result!.skills["test-skill"]!.installedAt).toBeDefined();
    expect(result!.skills["another-skill"]!.sourceType).toBe("local");

    // Verify file was written
    const content = await readFile(join(testDir, ".my-skills.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.skills["test-skill"]).toBeDefined();

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
});
