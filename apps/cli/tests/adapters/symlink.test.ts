import { lstat, mkdir, mkdtemp, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentId } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry } from "../../src/adapters/types.js";
import { SymlinkAdapter } from "../../src/adapters/symlink.js";

function makeSkill(name: string): AdapterSkillEntry {
  return {
    name,
    sourcePath: `/tmp/skills/${name}`,
    frontmatter: {
      name,
      description: `${name} skill`,
      version: "1.0.0",
    } as AdapterSkillEntry["frontmatter"],
    content: `# ${name}\nSome content`,
    files: [],
  };
}

describe("SymlinkAdapter", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "symlink-test-"));
    // Create the source .agents/skills directory
    await mkdir(join(projectRoot, ".agents", "skills", "test-skill"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("claude-code adapter", () => {
    const adapter = new SymlinkAdapter("claude-code", "Claude Code");

    it("has correct id and displayName", () => {
      expect(adapter.id).toBe("claude-code");
      expect(adapter.displayName).toBe("Claude Code");
    });

    it("detect always returns true", async () => {
      expect(await adapter.detect(projectRoot)).toBe(true);
    });

    it("getSkillsPath returns .claude/skills", () => {
      expect(adapter.getSkillsPath(projectRoot)).toBe(
        join(projectRoot, ".claude", "skills"),
      );
    });

    it("install creates a symlink from agent dir to .agents/skills/<name>", async () => {
      await adapter.install(projectRoot, makeSkill("test-skill"));

      const linkPath = join(projectRoot, ".claude", "skills", "test-skill");
      const stat = await lstat(linkPath);
      expect(stat.isSymbolicLink()).toBe(true);

      const target = await readlink(linkPath);
      expect(target).toBe(join("..", "..", ".agents", "skills", "test-skill"));
    });

    it("install replaces existing symlink", async () => {
      await adapter.install(projectRoot, makeSkill("test-skill"));
      // Install again — should not throw
      await adapter.install(projectRoot, makeSkill("test-skill"));

      const linkPath = join(projectRoot, ".claude", "skills", "test-skill");
      const stat = await lstat(linkPath);
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it("remove deletes the symlink", async () => {
      await adapter.install(projectRoot, makeSkill("test-skill"));
      await adapter.remove(projectRoot, "test-skill");

      const linkPath = join(projectRoot, ".claude", "skills", "test-skill");
      await expect(lstat(linkPath)).rejects.toThrow();
    });

    it("remove is a no-op if symlink does not exist", async () => {
      // Should not throw
      await adapter.remove(projectRoot, "nonexistent");
    });

    it("sync removes old symlinks and creates new ones", async () => {
      // Create an initial symlink
      await adapter.install(projectRoot, makeSkill("old-skill"));

      // Create target dirs for new skills
      await mkdir(join(projectRoot, ".agents", "skills", "skill-a"), {
        recursive: true,
      });
      await mkdir(join(projectRoot, ".agents", "skills", "skill-b"), {
        recursive: true,
      });

      await adapter.sync(projectRoot, [
        makeSkill("skill-a"),
        makeSkill("skill-b"),
      ]);

      const agentDir = join(projectRoot, ".claude", "skills");

      // Old symlink should be gone
      await expect(lstat(join(agentDir, "old-skill"))).rejects.toThrow();

      // New symlinks should exist
      const statA = await lstat(join(agentDir, "skill-a"));
      expect(statA.isSymbolicLink()).toBe(true);

      const statB = await lstat(join(agentDir, "skill-b"));
      expect(statB.isSymbolicLink()).toBe(true);
    });
  });

  describe("cursor adapter", () => {
    const adapter = new SymlinkAdapter("cursor", "Cursor");

    it("getSkillsPath returns .cursor/skills", () => {
      expect(adapter.getSkillsPath(projectRoot)).toBe(
        join(projectRoot, ".cursor", "skills"),
      );
    });
  });

  describe("unknown agent fallback", () => {
    // Use an agent ID that doesn't have a specific directory mapping
    const adapter = new SymlinkAdapter(
      "codex" as AgentId,
      "Codex (no symlink dir)",
    );

    it("getSkillsPath falls back to .agents/skills", () => {
      expect(adapter.getSkillsPath(projectRoot)).toBe(
        join(projectRoot, ".agents", "skills"),
      );
    });
  });
});
