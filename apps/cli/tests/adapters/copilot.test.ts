import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CopilotAdapter } from "../../src/adapters/copilot.js";
import type { AdapterSkillEntry } from "../../src/adapters/types.js";

function makeSkill(
  name: string,
  content = `Instructions for ${name}`,
): AdapterSkillEntry {
  return {
    name,
    sourcePath: `/tmp/skills/${name}`,
    frontmatter: {
      name,
      description: `${name} skill`,
      version: "1.0.0",
    } as AdapterSkillEntry["frontmatter"],
    content,
    files: [],
  };
}

describe("CopilotAdapter", () => {
  let projectRoot: string;
  const adapter = new CopilotAdapter();

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "copilot-test-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const copilotFile = () =>
    join(projectRoot, ".github", "copilot-instructions.md");

  it("has correct id and displayName", () => {
    expect(adapter.id).toBe("github-copilot");
    expect(adapter.displayName).toBe("GitHub Copilot");
  });

  describe("detect", () => {
    it("returns true when copilot-instructions.md exists", async () => {
      await mkdir(join(projectRoot, ".github"), { recursive: true });
      await writeFile(copilotFile(), "# Instructions\n");
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns true when .github/ directory exists", async () => {
      await mkdir(join(projectRoot, ".github"), { recursive: true });
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("returns false when neither exists", async () => {
      expect(await adapter.detect(projectRoot)).toBe(false);
    });
  });

  describe("install", () => {
    it("creates file with managed section on fresh project", async () => {
      await adapter.install(projectRoot, makeSkill("my-skill"));

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("<!-- my-skills:end -->");
      expect(content).toContain("<!-- my-skills:my-skill:start -->");
      expect(content).toContain("<!-- my-skills:my-skill:end -->");
      expect(content).toContain("Instructions for my-skill");
    });

    it("appends managed section to existing file without markers", async () => {
      await mkdir(join(projectRoot, ".github"), { recursive: true });
      await writeFile(copilotFile(), "# Existing instructions\n");

      await adapter.install(projectRoot, makeSkill("test"));

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("# Existing instructions");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("Instructions for test");
    });

    it("adds new skill to existing managed section", async () => {
      await adapter.install(projectRoot, makeSkill("first"));
      await adapter.install(projectRoot, makeSkill("second"));

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("<!-- my-skills:first:start -->");
      expect(content).toContain("<!-- my-skills:second:start -->");
      expect(content).toContain("Instructions for first");
      expect(content).toContain("Instructions for second");
    });

    it("replaces existing skill block on re-install", async () => {
      await adapter.install(projectRoot, makeSkill("my-skill", "v1 content"));
      await adapter.install(projectRoot, makeSkill("my-skill", "v2 content"));

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).not.toContain("v1 content");
      expect(content).toContain("v2 content");
      // Should only have one set of markers for this skill
      const starts = content.match(/my-skills:my-skill:start/g);
      expect(starts).toHaveLength(1);
    });
  });

  describe("remove", () => {
    it("removes a skill block from managed section", async () => {
      await adapter.install(projectRoot, makeSkill("keep"));
      await adapter.install(projectRoot, makeSkill("remove-me"));

      await adapter.remove(projectRoot, "remove-me");

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("Instructions for keep");
      expect(content).not.toContain("remove-me");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("<!-- my-skills:end -->");
    });

    it("is a no-op if file does not exist", async () => {
      // Should not throw
      await adapter.remove(projectRoot, "nonexistent");
    });

    it("is a no-op if skill is not in managed section", async () => {
      await adapter.install(projectRoot, makeSkill("present"));
      await adapter.remove(projectRoot, "absent");

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("Instructions for present");
    });
  });

  describe("sync", () => {
    it("creates file with all skills on fresh project", async () => {
      await adapter.sync(projectRoot, [
        makeSkill("alpha"),
        makeSkill("beta"),
      ]);

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("<!-- my-skills:alpha:start -->");
      expect(content).toContain("<!-- my-skills:beta:start -->");
    });

    it("replaces managed section preserving surrounding content", async () => {
      await mkdir(join(projectRoot, ".github"), { recursive: true });
      await writeFile(
        copilotFile(),
        "# Header\n<!-- my-skills:start -->\nold stuff\n<!-- my-skills:end -->\n# Footer\n",
      );

      await adapter.sync(projectRoot, [makeSkill("new-skill")]);

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("# Header");
      expect(content).toContain("# Footer");
      expect(content).not.toContain("old stuff");
      expect(content).toContain("Instructions for new-skill");
    });

    it("appends managed section to file without markers", async () => {
      await mkdir(join(projectRoot, ".github"), { recursive: true });
      await writeFile(copilotFile(), "# Existing\n");

      await adapter.sync(projectRoot, [makeSkill("synced")]);

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("# Existing");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("Instructions for synced");
    });

    it("sync with empty skills produces empty managed section", async () => {
      await adapter.sync(projectRoot, []);

      const content = await readFile(copilotFile(), "utf-8");
      expect(content).toContain("<!-- my-skills:start -->");
      expect(content).toContain("<!-- my-skills:end -->");
    });
  });

  it("getSkillsPath returns .github", () => {
    expect(adapter.getSkillsPath(projectRoot)).toBe(
      join(projectRoot, ".github"),
    );
  });
});
