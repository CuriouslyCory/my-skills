import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parse } from "smol-toml";

import { CodexAdapter } from "../../src/adapters/codex.js";
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

describe("CodexAdapter", () => {
  let projectRoot: string;
  const adapter = new CodexAdapter();

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "codex-test-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const codexFile = () => join(projectRoot, ".codex", "config.toml");

  it("has correct id and displayName", () => {
    expect(adapter.id).toBe("codex");
    expect(adapter.displayName).toBe("Codex");
  });

  describe("detect", () => {
    it("returns true when config.toml exists", async () => {
      await mkdir(join(projectRoot, ".codex"), { recursive: true });
      await writeFile(codexFile(), "");
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns true when .codex/ directory exists", async () => {
      await mkdir(join(projectRoot, ".codex"), { recursive: true });
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns false when neither exists", async () => {
      expect(await adapter.detect(projectRoot)).toBe(false);
    });
  });

  describe("install", () => {
    it("creates config.toml with skill section on fresh project", async () => {
      await adapter.install(projectRoot, makeSkill("my-skill"));

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.skills).toBeDefined();
      expect(doc.skills["my-skill"]).toBeDefined();
      expect(doc.skills["my-skill"].description).toBe("my-skill skill");
      expect(doc.skills["my-skill"].instructions).toBe(
        "Instructions for my-skill",
      );
    });

    it("adds skill to existing config preserving other content", async () => {
      await mkdir(join(projectRoot, ".codex"), { recursive: true });
      await writeFile(codexFile(), 'model = "gpt-4"\n');

      await adapter.install(projectRoot, makeSkill("test"));

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.model).toBe("gpt-4");
      expect(doc.skills.test.instructions).toBe("Instructions for test");
    });

    it("replaces existing skill on re-install", async () => {
      await adapter.install(
        projectRoot,
        makeSkill("my-skill", "v1 content"),
      );
      await adapter.install(
        projectRoot,
        makeSkill("my-skill", "v2 content"),
      );

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.skills["my-skill"].instructions).toBe("v2 content");
    });
  });

  describe("remove", () => {
    it("removes a skill section", async () => {
      await adapter.install(projectRoot, makeSkill("keep"));
      await adapter.install(projectRoot, makeSkill("remove-me"));

      await adapter.remove(projectRoot, "remove-me");

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.skills.keep).toBeDefined();
      expect(doc.skills["remove-me"]).toBeUndefined();
    });

    it("is a no-op if file does not exist", async () => {
      await adapter.remove(projectRoot, "nonexistent");
    });

    it("is a no-op if skill is not present", async () => {
      await adapter.install(projectRoot, makeSkill("present"));
      await adapter.remove(projectRoot, "absent");

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.skills.present).toBeDefined();
    });
  });

  describe("sync", () => {
    it("replaces entire skills table", async () => {
      await adapter.install(projectRoot, makeSkill("old"));

      await adapter.sync(projectRoot, [
        makeSkill("alpha"),
        makeSkill("beta"),
      ]);

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.skills.old).toBeUndefined();
      expect(doc.skills.alpha).toBeDefined();
      expect(doc.skills.beta).toBeDefined();
    });

    it("preserves non-skill config on sync", async () => {
      await mkdir(join(projectRoot, ".codex"), { recursive: true });
      await writeFile(codexFile(), 'model = "gpt-4"\n');

      await adapter.sync(projectRoot, [makeSkill("synced")]);

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(doc.model).toBe("gpt-4");
      expect(doc.skills.synced).toBeDefined();
    });

    it("sync with empty skills clears skills table", async () => {
      await adapter.install(projectRoot, makeSkill("old"));
      await adapter.sync(projectRoot, []);

      const raw = await readFile(codexFile(), "utf-8");
      const doc = parse(raw) as Record<string, any>;
      expect(Object.keys(doc.skills as object)).toHaveLength(0);
    });
  });

  it("getSkillsPath returns .codex", () => {
    expect(adapter.getSkillsPath(projectRoot)).toBe(
      join(projectRoot, ".codex"),
    );
  });
});
