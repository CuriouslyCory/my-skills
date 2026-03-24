import {
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

import { restoreFromManifest } from "../../src/commands/add.js";

/**
 * Create a minimal skill directory in .agents/skills/<name>/ with a SKILL.md
 * so that the hash computation and adapter install have something to work with.
 */
async function seedSkill(
  projectRoot: string,
  skillName: string,
  content = `---\nname: ${skillName}\ndescription: test skill\n---\n# ${skillName}\n`,
): Promise<void> {
  const skillDir = join(projectRoot, ".agents", "skills", skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), content);
}

describe("restoreFromManifest", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "add-test-"));
    // Silence console output during tests
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("creates symlinks for up-to-date skills during restore", async () => {
    // Seed a skill in .agents/skills/
    await seedSkill(projectRoot, "test-skill");

    // Build a manifest that references this skill.
    // Use a hash that matches what computeSkillHash will produce so the
    // skill is treated as "already up to date" (the branch we're fixing).
    const { computeSkillHash } = await import("../../src/core/skill-hasher.js");
    const hash = await computeSkillHash(
      join(projectRoot, ".agents", "skills", "test-skill"),
    );

    const manifest: Manifest = {
      version: 1,
      agents: ["claude-code"],
      skills: {
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
          agents: ["claude-code"],
        },
      },
    };

    const targetDir = join(projectRoot, ".agents", "skills");
    const agents: AgentId[] = ["claude-code"];

    await restoreFromManifest(manifest, targetDir, projectRoot, agents);

    // Verify the symlink was created at .claude/skills/test-skill
    const linkPath = join(projectRoot, ".claude", "skills", "test-skill");
    const stat = await lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);

    const target = await readlink(linkPath);
    expect(target).toBe(join("..", "..", ".agents", "skills", "test-skill"));
  });

  it("creates symlinks for multiple agents during restore", async () => {
    await seedSkill(projectRoot, "multi-agent-skill");

    const { computeSkillHash } = await import("../../src/core/skill-hasher.js");
    const hash = await computeSkillHash(
      join(projectRoot, ".agents", "skills", "multi-agent-skill"),
    );

    const manifest: Manifest = {
      version: 1,
      agents: ["claude-code", "cursor"],
      skills: {
        "multi-agent-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
          agents: ["claude-code", "cursor"],
        },
      },
    };

    const targetDir = join(projectRoot, ".agents", "skills");
    const agents: AgentId[] = ["claude-code", "cursor"];

    await restoreFromManifest(manifest, targetDir, projectRoot, agents);

    // Verify symlinks for both agents
    const claudeLink = join(
      projectRoot,
      ".claude",
      "skills",
      "multi-agent-skill",
    );
    const cursorLink = join(
      projectRoot,
      ".cursor",
      "skills",
      "multi-agent-skill",
    );

    expect((await lstat(claudeLink)).isSymbolicLink()).toBe(true);
    expect((await lstat(cursorLink)).isSymbolicLink()).toBe(true);
  });

  it("uses manifest-level agents when skill entry has no agents", async () => {
    await seedSkill(projectRoot, "no-agent-skill");

    const { computeSkillHash } = await import("../../src/core/skill-hasher.js");
    const hash = await computeSkillHash(
      join(projectRoot, ".agents", "skills", "no-agent-skill"),
    );

    const manifest: Manifest = {
      version: 1,
      agents: ["claude-code"],
      skills: {
        "no-agent-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
          // No agents field on the skill entry
        },
      },
    };

    const targetDir = join(projectRoot, ".agents", "skills");
    const agents: AgentId[] = ["claude-code"];

    await restoreFromManifest(manifest, targetDir, projectRoot, agents);

    const linkPath = join(projectRoot, ".claude", "skills", "no-agent-skill");
    const stat = await lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("prints summary with no skills", async () => {
    const manifest: Manifest = {
      version: 1,
      agents: [],
      skills: {},
    };

    await restoreFromManifest(manifest, "/tmp/unused", projectRoot, []);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("no skills"),
    );
  });
});
