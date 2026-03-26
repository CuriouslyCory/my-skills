import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveSkill } from "../../src/core/skill-resolver.js";

function makeSkillMd(name: string, description = "A test skill"): string {
  return `---
name: ${name}
description: ${description}
---

Body content for ${name}
`;
}

describe("skill-resolver", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "resolver-test-"));
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  describe("resolveSkill", () => {
    it("finds a skill in a nested directory", async () => {
      const skillDir = join(repoDir, "skills", "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), makeSkillMd("my-skill"));

      const result = await resolveSkill("my-skill", repoDir);

      expect(result.name).toBe("my-skill");
      expect(result.sourcePath).toBe(skillDir);
      expect(result.frontmatter.name).toBe("my-skill");
      expect(result.content).toContain("Body content for my-skill");
    });

    it("returns correct files list", async () => {
      const skillDir = join(repoDir, "skills", "test-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), makeSkillMd("test-skill"));
      await writeFile(join(skillDir, "config.json"), '{"key": "value"}');

      const result = await resolveSkill("test-skill", repoDir);

      expect(result.files).toEqual(["SKILL.md", "config.json"]);
    });

    it("returns sorted relative paths for files", async () => {
      const skillDir = join(repoDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), makeSkillMd("my-skill"));
      await writeFile(join(skillDir, "z-file.txt"), "z");
      await writeFile(join(skillDir, "a-file.txt"), "a");

      const result = await resolveSkill("my-skill", repoDir);

      expect(result.files).toEqual(["SKILL.md", "a-file.txt", "z-file.txt"]);
    });

    it("handles nested subdirectories in file collection", async () => {
      const skillDir = join(repoDir, "my-skill");
      await mkdir(join(skillDir, "sub", "deep"), { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), makeSkillMd("my-skill"));
      await writeFile(join(skillDir, "sub", "nested.txt"), "nested");
      await writeFile(join(skillDir, "sub", "deep", "deep.txt"), "deep");

      const result = await resolveSkill("my-skill", repoDir);

      expect(result.files).toEqual([
        "SKILL.md",
        "sub/deep/deep.txt",
        "sub/nested.txt",
      ]);
    });
  });

  describe("directory skipping", () => {
    it("skips node_modules directories", async () => {
      // Skill is inside node_modules — should not be found
      const nmDir = join(repoDir, "node_modules", "pkg");
      await mkdir(nmDir, { recursive: true });
      await writeFile(join(nmDir, "SKILL.md"), makeSkillMd("hidden-skill"));

      await expect(resolveSkill("hidden-skill", repoDir)).rejects.toThrow(
        /not found in repository/,
      );
    });

    it("skips .git directories", async () => {
      const gitDir = join(repoDir, ".git", "hooks");
      await mkdir(gitDir, { recursive: true });
      await writeFile(join(gitDir, "SKILL.md"), makeSkillMd("git-skill"));

      await expect(resolveSkill("git-skill", repoDir)).rejects.toThrow(
        /not found in repository/,
      );
    });
  });

  describe("invalid frontmatter", () => {
    it("skips SKILL.md with invalid YAML and continues searching", async () => {
      // Invalid skill in one directory
      const badDir = join(repoDir, "bad-skill");
      await mkdir(badDir, { recursive: true });
      await writeFile(join(badDir, "SKILL.md"), "not valid frontmatter at all");

      // Valid skill in another directory
      const goodDir = join(repoDir, "good-skill");
      await mkdir(goodDir, { recursive: true });
      await writeFile(join(goodDir, "SKILL.md"), makeSkillMd("good-skill"));

      const result = await resolveSkill("good-skill", repoDir);
      expect(result.name).toBe("good-skill");
    });

    it("logs warning for invalid frontmatter via catch block", async () => {
      // SKILL.md with frontmatter missing required 'name' field
      const badDir = join(repoDir, "bad");
      await mkdir(badDir, { recursive: true });
      await writeFile(
        join(badDir, "SKILL.md"),
        "---\ndescription: no name\n---\nbody",
      );

      // The skill won't be found since frontmatter parsing throws
      await expect(resolveSkill("no-name-skill", repoDir)).rejects.toThrow(
        /not found in repository/,
      );
    });
  });

  describe("skill not found", () => {
    it("throws descriptive error when skill name doesn't exist", async () => {
      await expect(
        resolveSkill("nonexistent-skill", repoDir),
      ).rejects.toThrow('Skill "nonexistent-skill" not found in repository');
    });

    it("throws when repo is empty", async () => {
      await expect(resolveSkill("any-skill", repoDir)).rejects.toThrow(
        /not found in repository/,
      );
    });
  });
});
