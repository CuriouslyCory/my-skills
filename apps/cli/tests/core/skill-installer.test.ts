import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installSkill, replaceSkill } from "../../src/core/skill-installer.js";
import { computeSkillHash } from "../../src/core/skill-hasher.js";
import type { ResolvedSkill } from "../../src/core/skill-resolver.js";

function makeSkillMd(name: string, description = "A test skill"): string {
  return `---
name: ${name}
description: ${description}
---

Body content for ${name}
`;
}

function makeResolvedSkill(
  name: string,
  sourcePath: string,
): ResolvedSkill {
  return {
    name,
    sourcePath,
    frontmatter: { name, description: "A test skill" },
    content: makeSkillMd(name),
    files: ["SKILL.md"],
  };
}

describe("skill-installer", () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "installer-source-"));
    targetDir = await mkdtemp(join(tmpdir(), "installer-target-"));
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  });

  describe("installSkill", () => {
    it("copies all files from source to destination", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));
      await writeFile(join(sourceDir, "config.json"), '{"key": "value"}');

      const skill = makeResolvedSkill("my-skill", sourceDir);
      await installSkill(skill, targetDir);

      const destPath = join(targetDir, "my-skill");
      const skillMd = await readFile(join(destPath, "SKILL.md"), "utf-8");
      const config = await readFile(join(destPath, "config.json"), "utf-8");

      expect(skillMd).toContain("Body content for my-skill");
      expect(config).toBe('{"key": "value"}');
    });

    it("preserves directory structure", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));
      await mkdir(join(sourceDir, "sub", "deep"), { recursive: true });
      await writeFile(join(sourceDir, "sub", "nested.txt"), "nested");
      await writeFile(join(sourceDir, "sub", "deep", "deep.txt"), "deep");

      const skill = makeResolvedSkill("my-skill", sourceDir);
      await installSkill(skill, targetDir);

      const destPath = join(targetDir, "my-skill");
      const nested = await readFile(join(destPath, "sub", "nested.txt"), "utf-8");
      const deep = await readFile(join(destPath, "sub", "deep", "deep.txt"), "utf-8");

      expect(nested).toBe("nested");
      expect(deep).toBe("deep");
    });

    it("returns a SHA-256 hex hash", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const hash = await installSkill(skill, targetDir);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("returns a deterministic hash for the same content", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const hash1 = await installSkill(skill, targetDir);

      // Clean target and reinstall
      await rm(join(targetDir, "my-skill"), { recursive: true, force: true });
      const hash2 = await installSkill(skill, targetDir);

      expect(hash1).toBe(hash2);
    });

    it("returns a different hash when content changes", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const hash1 = await installSkill(skill, targetDir);

      // Change source content
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill", "Updated description"));
      await rm(join(targetDir, "my-skill"), { recursive: true, force: true });
      const hash2 = await installSkill(skill, targetDir);

      expect(hash1).not.toBe(hash2);
    });

    it("returns a different hash when a file is added", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const hash1 = await installSkill(skill, targetDir);

      // Add a new file to source
      await writeFile(join(sourceDir, "extra.txt"), "extra content");
      await rm(join(targetDir, "my-skill"), { recursive: true, force: true });
      const hash2 = await installSkill(skill, targetDir);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("target directory creation", () => {
    it("creates the target directory if it doesn't exist", async () => {
      const newTargetDir = join(targetDir, "nested", "path");
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const hash = await installSkill(skill, newTargetDir);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      const content = await readFile(
        join(newTargetDir, "my-skill", "SKILL.md"),
        "utf-8",
      );
      expect(content).toContain("Body content for my-skill");
    });
  });

  describe("hash consistency with computeSkillHash", () => {
    it("returns the same hash as computing directly on the destination", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));
      await writeFile(join(sourceDir, "extra.txt"), "extra");

      const skill = makeResolvedSkill("my-skill", sourceDir);
      const installHash = await installSkill(skill, targetDir);

      const directHash = await computeSkillHash(join(targetDir, "my-skill"));
      expect(installHash).toBe(directHash);
    });
  });

  describe("replaceSkill", () => {
    /** Seed an existing install at <dir>/<name> with a marker file. */
    async function seedInstall(dir: string, name: string, marker: string) {
      await mkdir(join(dir, name), { recursive: true });
      await writeFile(join(dir, name, "SKILL.md"), marker);
    }

    async function listBackups(dir: string): Promise<string[]> {
      const entries = await readdir(dir).catch(() => [] as string[]);
      return entries.filter((e) => e.includes(".ms-backup-"));
    }

    it("swaps in the new install and discards the old one on commit", async () => {
      await seedInstall(targetDir, "my-skill", "old content");
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));
      // A file only the old install had must not survive the replacement.
      await writeFile(join(targetDir, "my-skill", "stale.txt"), "stale");

      const replacement = await replaceSkill(
        makeResolvedSkill("my-skill", sourceDir),
        targetDir,
      );
      await replacement.commit();

      const content = await readFile(
        join(targetDir, "my-skill", "SKILL.md"),
        "utf-8",
      );
      expect(content).toContain("Body content for my-skill");
      expect(await readdir(join(targetDir, "my-skill"))).toEqual(["SKILL.md"]);
      expect(replacement.hash).toBe(
        await computeSkillHash(join(targetDir, "my-skill")),
      );
      expect(await listBackups(targetDir)).toEqual([]);
    });

    it("restores the previous install when the install itself fails", async () => {
      await seedInstall(targetDir, "my-skill", "old content");
      // Source dir that does not exist -> cp throws mid-install.
      const missingSource = join(sourceDir, "does-not-exist");

      await expect(
        replaceSkill(makeResolvedSkill("my-skill", missingSource), targetDir),
      ).rejects.toThrow();

      const content = await readFile(
        join(targetDir, "my-skill", "SKILL.md"),
        "utf-8",
      );
      expect(content).toBe("old content");
      expect(await listBackups(targetDir)).toEqual([]);
    });

    it("rolls back to the previous install on request", async () => {
      await seedInstall(targetDir, "my-skill", "old content");
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const replacement = await replaceSkill(
        makeResolvedSkill("my-skill", sourceDir),
        targetDir,
      );
      await replacement.rollback();

      const content = await readFile(
        join(targetDir, "my-skill", "SKILL.md"),
        "utf-8",
      );
      expect(content).toBe("old content");
      expect(await listBackups(targetDir)).toEqual([]);
    });

    it("moves an install between deploy dirs, removing the old one on commit", async () => {
      const oldDir = join(targetDir, "skills");
      const newDir = join(targetDir, "agents");
      await seedInstall(oldDir, "my-skill", "old content");
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const replacement = await replaceSkill(
        makeResolvedSkill("my-skill", sourceDir),
        newDir,
        join(oldDir, "my-skill"),
      );
      await replacement.commit();

      expect(await readdir(oldDir)).toEqual([]);
      const content = await readFile(join(newDir, "my-skill", "SKILL.md"), "utf-8");
      expect(content).toContain("Body content for my-skill");
    });

    it("installs fresh when nothing exists yet", async () => {
      await writeFile(join(sourceDir, "SKILL.md"), makeSkillMd("my-skill"));

      const replacement = await replaceSkill(
        makeResolvedSkill("my-skill", sourceDir),
        targetDir,
      );
      await replacement.commit();

      expect(await readdir(targetDir)).toEqual(["my-skill"]);
    });
  });
});
