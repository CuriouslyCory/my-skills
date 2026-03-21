import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    set text(_v: string) {
      /* noop */
    },
  }),
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: vi.fn(() => []),
  resolveAgents: vi.fn(() => Promise.resolve([])),
}));

import { removeSingleSkill } from "../../src/commands/remove.js";

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

describe("removeSingleSkill", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "remove-test-"));
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("removes skill directory and updates manifest", async () => {
    const targetDir = join(projectRoot, ".agents", "skills");
    const skillDir = join(targetDir, "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# test");

    const manifest = makeManifest({
      "test-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
        agents: [],
      },
    });

    const result = await removeSingleSkill(
      "test-skill",
      targetDir,
      projectRoot,
      manifest,
      true,
      [],
    );

    // Skill dir should be deleted
    const exists = await stat(skillDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);

    // Manifest should have skill removed
    expect(result.skills["test-skill"]).toBeUndefined();
  });

  it("returns unchanged manifest for non-existent skill", async () => {
    const manifest = makeManifest({});

    const result = await removeSingleSkill(
      "nonexistent",
      join(projectRoot, ".agents", "skills"),
      projectRoot,
      manifest,
      true,
      [],
    );

    expect(result).toEqual(manifest);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("not installed"),
    );
  });

  it("handles already-deleted skill directory gracefully", async () => {
    const targetDir = join(projectRoot, ".agents", "skills");

    const manifest = makeManifest({
      "ghost-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
        agents: [],
      },
    });

    const result = await removeSingleSkill(
      "ghost-skill",
      targetDir,
      projectRoot,
      manifest,
      true,
      [],
    );

    expect(result.skills["ghost-skill"]).toBeUndefined();
  });

  it("removes multiple skills when called sequentially", async () => {
    const targetDir = join(projectRoot, ".agents", "skills");
    await mkdir(join(targetDir, "skill-a"), { recursive: true });
    await writeFile(join(targetDir, "skill-a", "SKILL.md"), "# A");
    await mkdir(join(targetDir, "skill-b"), { recursive: true });
    await writeFile(join(targetDir, "skill-b", "SKILL.md"), "# B");

    let manifest = makeManifest({
      "skill-a": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "aaa",
        installedAt: new Date().toISOString(),
      },
      "skill-b": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "bbb",
        installedAt: new Date().toISOString(),
      },
    });

    manifest = await removeSingleSkill("skill-a", targetDir, projectRoot, manifest, true, []);
    manifest = await removeSingleSkill("skill-b", targetDir, projectRoot, manifest, true, []);

    expect(Object.keys(manifest.skills)).toHaveLength(0);
  });
});
