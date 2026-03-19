import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parse } from "smol-toml";

import { GeminiAdapter } from "../../src/adapters/gemini.js";
import type { AdapterSkillEntry } from "../../src/adapters/types.js";

function makeSkill(
  name: string,
  content = `Instructions for ${name}`,
  description?: string,
): AdapterSkillEntry {
  return {
    name,
    sourcePath: `/tmp/skills/${name}`,
    frontmatter: {
      name,
      description: description ?? `${name} skill`,
      version: "1.0.0",
    } as AdapterSkillEntry["frontmatter"],
    content,
    files: [],
  };
}

describe("GeminiAdapter", () => {
  let projectRoot: string;
  const adapter = new GeminiAdapter();

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "gemini-test-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const tomlFile = (name: string) =>
    join(projectRoot, ".gemini", "commands", `${name}.toml`);
  const geminiMd = () => join(projectRoot, "GEMINI.md");

  it("has correct id and displayName", () => {
    expect(adapter.id).toBe("gemini-cli");
    expect(adapter.displayName).toBe("Gemini CLI");
  });

  describe("detect", () => {
    it("returns true when .gemini/commands exists", async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(projectRoot, ".gemini", "commands"), {
        recursive: true,
      });
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns true when .gemini/ exists", async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(projectRoot, ".gemini"), { recursive: true });
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns true when GEMINI.md exists", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(geminiMd(), "# Gemini\n");
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns false when nothing exists", async () => {
      expect(await adapter.detect(projectRoot)).toBe(false);
    });
  });

  describe("install", () => {
    it("creates TOML command file", async () => {
      await adapter.install(projectRoot, makeSkill("my-skill"));

      const raw = await readFile(tomlFile("my-skill"), "utf-8");
      const doc = parse(raw) as Record<string, unknown>;
      expect(doc.name).toBe("my-skill");
      expect(doc.description).toBe("my-skill skill");
      expect(doc.instructions).toBe("Instructions for my-skill");
    });

    it("adds reference to GEMINI.md", async () => {
      await adapter.install(projectRoot, makeSkill("my-skill"));

      const content = await readFile(geminiMd(), "utf-8");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("<!-- my-skills:end -->");
      expect(content).toContain("**my-skill**");
      expect(content).toContain("(command: `my-skill`)");
    });

    it("adds multiple skills", async () => {
      await adapter.install(projectRoot, makeSkill("first"));
      await adapter.install(projectRoot, makeSkill("second"));

      const content = await readFile(geminiMd(), "utf-8");
      expect(content).toContain("**first**");
      expect(content).toContain("**second**");

      // Both TOML files should exist
      await access(tomlFile("first"));
      await access(tomlFile("second"));
    });
  });

  describe("remove", () => {
    it("removes TOML command file and GEMINI.md reference", async () => {
      await adapter.install(projectRoot, makeSkill("keep"));
      await adapter.install(projectRoot, makeSkill("remove-me"));

      await adapter.remove(projectRoot, "remove-me");

      // TOML file should be gone
      await expect(access(tomlFile("remove-me"))).rejects.toThrow();

      // GEMINI.md should not contain reference
      const content = await readFile(geminiMd(), "utf-8");
      expect(content).toContain("**keep**");
      expect(content).not.toContain("**remove-me**");
    });

    it("is a no-op if skill does not exist", async () => {
      await adapter.remove(projectRoot, "nonexistent");
    });
  });

  describe("sync", () => {
    it("writes all TOML files and syncs GEMINI.md", async () => {
      await adapter.sync(projectRoot, [
        makeSkill("alpha"),
        makeSkill("beta"),
      ]);

      // TOML files
      const rawA = await readFile(tomlFile("alpha"), "utf-8");
      expect(parse(rawA).name).toBe("alpha");
      const rawB = await readFile(tomlFile("beta"), "utf-8");
      expect(parse(rawB).name).toBe("beta");

      // GEMINI.md
      const content = await readFile(geminiMd(), "utf-8");
      expect(content).toContain("**alpha**");
      expect(content).toContain("**beta**");
    });

    it("sync with empty skills produces empty managed section in GEMINI.md", async () => {
      await adapter.sync(projectRoot, []);

      const content = await readFile(geminiMd(), "utf-8");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("<!-- my-skills:end -->");
    });
  });

  it("getSkillsPath returns .gemini/commands", () => {
    expect(adapter.getSkillsPath(projectRoot)).toBe(
      join(projectRoot, ".gemini", "commands"),
    );
  });
});
