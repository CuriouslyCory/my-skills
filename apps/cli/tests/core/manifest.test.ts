import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest, SkillEntry } from "@curiouslycory/shared-types";

import {
  addSkill,
  getSkill,
  loadManifest,
  removeSkill,
  saveManifest,
} from "../../src/core/manifest.js";

const makeManifest = (skills: Record<string, SkillEntry> = {}): Manifest => ({
  version: 1,
  agents: [],
  skills,
});

const makeEntry = (overrides: Partial<SkillEntry> = {}): SkillEntry => ({
  source: "owner/repo",
  sourceType: "github",
  computedHash: "abc123",
  installedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("manifest", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "manifest-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("loadManifest", () => {
    it("returns null when no manifest exists", async () => {
      const result = await loadManifest(testDir);
      expect(result).toBeNull();
    });

    it("loads a valid manifest", async () => {
      const manifest = makeManifest({ "my-skill": makeEntry() });
      await writeFile(
        join(testDir, ".my-skills.json"),
        JSON.stringify(manifest),
      );

      const result = await loadManifest(testDir);
      expect(result).not.toBeNull();
      expect(result?.skills["my-skill"]?.source).toBe("owner/repo");
    });

    it("returns null for invalid JSON", async () => {
      await writeFile(join(testDir, ".my-skills.json"), "not json{");
      const result = await loadManifest(testDir);
      expect(result).toBeNull();
    });
  });

  describe("saveManifest", () => {
    it("writes manifest to project root", async () => {
      const manifest = makeManifest({ "test-skill": makeEntry() });
      await saveManifest(testDir, manifest);

      const content = await readFile(join(testDir, ".my-skills.json"), "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed.version).toBe(1);
      expect(
        (parsed.skills as Record<string, unknown>)["test-skill"],
      ).toBeDefined();
    });
  });

  describe("addSkill", () => {
    it("adds a skill to the manifest", () => {
      const manifest = makeManifest();
      const entry = makeEntry();
      const updated = addSkill(manifest, "new-skill", entry);

      expect(updated.skills["new-skill"]).toEqual(entry);
    });

    it("does not mutate the original manifest", () => {
      const manifest = makeManifest();
      const entry = makeEntry();
      addSkill(manifest, "new-skill", entry);

      expect(manifest.skills["new-skill"]).toBeUndefined();
    });
  });

  describe("removeSkill", () => {
    it("removes a skill from the manifest", () => {
      const manifest = makeManifest({ "to-remove": makeEntry() });
      const updated = removeSkill(manifest, "to-remove");

      expect(updated.skills["to-remove"]).toBeUndefined();
    });

    it("does not mutate the original manifest", () => {
      const manifest = makeManifest({ keep: makeEntry() });
      removeSkill(manifest, "keep");

      expect(manifest.skills.keep).toBeDefined();
    });

    it("handles removing non-existent skill gracefully", () => {
      const manifest = makeManifest({ existing: makeEntry() });
      const updated = removeSkill(manifest, "nonexistent");

      expect(updated.skills.existing).toBeDefined();
    });
  });

  describe("getSkill", () => {
    it("returns skill entry when it exists", () => {
      const entry = makeEntry();
      const manifest = makeManifest({ "my-skill": entry });

      expect(getSkill(manifest, "my-skill")).toEqual(entry);
    });

    it("returns undefined for non-existent skill", () => {
      const manifest = makeManifest();
      expect(getSkill(manifest, "missing")).toBeUndefined();
    });
  });

  describe("loadManifest error paths", () => {
    it("returns null and logs warning for corrupted JSON", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await writeFile(join(testDir, ".my-skills.json"), "this is not json {{");

      const result = await loadManifest(testDir);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]?.[0]).toContain("invalid JSON");
      warnSpy.mockRestore();
    });

    it("returns null and logs warning for invalid Zod shape", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      // Valid JSON but missing required 'version' field
      await writeFile(
        join(testDir, ".my-skills.json"),
        JSON.stringify({ skills: {} }),
      );

      const result = await loadManifest(testDir);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]?.[0]).toContain("schema");
      warnSpy.mockRestore();
    });

    it("re-throws non-ENOENT filesystem errors", async () => {
      // Use a directory path instead of a file to trigger EISDIR
      const dirPath = await mkdtemp(join(testDir, "subdir-"));
      // Create .my-skills.json as a directory so readFile throws EISDIR
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(dirPath, ".my-skills.json"));

      await expect(loadManifest(dirPath)).rejects.toThrow();
    });
  });

  describe("getSkill edge cases", () => {
    it("returns undefined for missing key in populated manifest", () => {
      const manifest = makeManifest({
        "skill-a": makeEntry(),
        "skill-b": makeEntry(),
      });
      expect(getSkill(manifest, "skill-c")).toBeUndefined();
    });
  });

  describe("removeSkill edge cases", () => {
    it("returns manifest unchanged when removing missing key", () => {
      const manifest = makeManifest({
        "skill-a": makeEntry(),
        "skill-b": makeEntry(),
      });
      const updated = removeSkill(manifest, "nonexistent");

      expect(Object.keys(updated.skills)).toHaveLength(2);
      expect(updated.skills["skill-a"]).toBeDefined();
      expect(updated.skills["skill-b"]).toBeDefined();
    });
  });
});
