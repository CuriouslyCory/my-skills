import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

// ---------------------------------------------------------------------------
// Hoisted mocks — created before vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockLoadConfig,
  mockLoadManifest,
  mockSaveManifest,
  mockResolveAgents,
  mockGetEnabledAdapters,
  mockCheckbox,
  mockOraSpinner,
} = vi.hoisted(() => {
  const spinner: Record<string, ReturnType<typeof vi.fn>> = {
    succeed: vi.fn(),
    fail: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
  };
  spinner.start.mockReturnValue(spinner);
  spinner.succeed.mockReturnValue(spinner);
  spinner.fail.mockReturnValue(spinner);
  spinner.stop.mockReturnValue(spinner);

  return {
    mockLoadConfig: vi.fn().mockResolvedValue({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    }),
    mockLoadManifest: vi.fn().mockResolvedValue(null),
    mockSaveManifest: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    mockResolveAgents: vi
      .fn<[], Promise<AgentId[]>>()
      .mockResolvedValue(["claude-code"]),
    mockGetEnabledAdapters: vi.fn().mockReturnValue([]),
    mockCheckbox: vi.fn().mockResolvedValue([]),
    mockOraSpinner: spinner,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("../../src/core/config.js", () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: mockLoadManifest,
  saveManifest: mockSaveManifest,
  getSkill: (manifest: { skills: Record<string, unknown> }, name: string) =>
    manifest.skills[name],
  removeSkill: (manifest: Manifest, name: string) => {
    const { [name]: _, ...rest } = manifest.skills;
    return { ...manifest, skills: rest };
  },
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: mockGetEnabledAdapters,
  resolveAgents: mockResolveAgents,
}));

vi.mock("@inquirer/checkbox", () => ({
  default: mockCheckbox,
}));

vi.mock("ora", () => ({
  default: () => mockOraSpinner,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { registerRemoveCommand } from "../../src/commands/remove.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

function makeSkillEntry(
  overrides: Partial<Manifest["skills"][string]> = {},
): Manifest["skills"][string] {
  return {
    source: "owner/repo",
    sourceType: "github",
    computedHash: "abc12345",
    installedAt: new Date().toISOString(),
    agents: [],
    ...overrides,
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerRemoveCommand(program);
  return program;
}

async function runRemove(...args: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(["node", "ms", "remove", ...args]);
}

function resetSpinnerMock(): void {
  mockOraSpinner.start.mockReturnValue(mockOraSpinner);
  mockOraSpinner.succeed.mockReturnValue(mockOraSpinner);
  mockOraSpinner.fail.mockReturnValue(mockOraSpinner);
  mockOraSpinner.stop.mockReturnValue(mockOraSpinner);
  mockGetEnabledAdapters.mockReturnValue([]);
  mockSaveManifest.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("remove command — flag tests", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "remove-flags-"));
    resetSpinnerMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(projectRoot);

    // Reset mocks to defaults
    mockLoadManifest.mockResolvedValue(null);
    mockLoadConfig.mockResolvedValue({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("--skill flag with comma-separated names", () => {
    it("removes multiple skills", async () => {
      const targetDir = join(projectRoot, ".agents", "skills");
      await mkdir(join(targetDir, "skill-a"), { recursive: true });
      await writeFile(join(targetDir, "skill-a", "SKILL.md"), "# A");
      await mkdir(join(targetDir, "skill-b"), { recursive: true });
      await writeFile(join(targetDir, "skill-b", "SKILL.md"), "# B");

      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "skill-a": makeSkillEntry(),
          "skill-b": makeSkillEntry(),
        }),
      );

      await runRemove("--skill", "skill-a,skill-b", "--yes");

      // Both skills should have been removed — saveManifest called
      expect(mockSaveManifest).toHaveBeenCalled();
      // Spinner succeed called for each removal
      expect(mockOraSpinner.succeed).toHaveBeenCalledTimes(2);

      // Directories should be deleted
      const existsA = await stat(join(targetDir, "skill-a"))
        .then(() => true)
        .catch(() => false);
      const existsB = await stat(join(targetDir, "skill-b"))
        .then(() => true)
        .catch(() => false);
      expect(existsA).toBe(false);
      expect(existsB).toBe(false);
    });
  });

  describe("--all flag", () => {
    it("removes all installed skills", async () => {
      const targetDir = join(projectRoot, ".agents", "skills");
      await mkdir(join(targetDir, "s1"), { recursive: true });
      await writeFile(join(targetDir, "s1", "SKILL.md"), "# S1");
      await mkdir(join(targetDir, "s2"), { recursive: true });
      await writeFile(join(targetDir, "s2", "SKILL.md"), "# S2");

      mockLoadManifest.mockResolvedValue(
        makeManifest({
          s1: makeSkillEntry(),
          s2: makeSkillEntry(),
        }),
      );

      await runRemove("--all");

      // Should remove both skills (--all implies --yes)
      expect(mockOraSpinner.succeed).toHaveBeenCalledTimes(2);
      expect(mockCheckbox).not.toHaveBeenCalled();
    });
  });

  describe("--global flag", () => {
    it("targets global skills directory", async () => {
      const globalDir = join(homedir(), ".agents", "skills");
      const skillDir = join(globalDir, "global-skill");

      // Create a skill in the global dir
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# Global");

      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "global-skill": makeSkillEntry(),
        }),
      );

      await runRemove("global-skill", "--global", "--yes");

      expect(mockOraSpinner.succeed).toHaveBeenCalledTimes(1);

      // Clean up the global test dir
      await rm(skillDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    });
  });

  describe("--yes flag", () => {
    it("skips confirmation prompt", async () => {
      const targetDir = join(projectRoot, ".agents", "skills");
      await mkdir(join(targetDir, "my-skill"), { recursive: true });
      await writeFile(join(targetDir, "my-skill", "SKILL.md"), "# S");

      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "my-skill": makeSkillEntry(),
        }),
      );

      await runRemove("my-skill", "--yes");

      // Should remove without prompting
      expect(mockOraSpinner.succeed).toHaveBeenCalledTimes(1);
      // @inquirer/confirm should NOT be called (dynamic import inside removeSingleSkill)
      // The checkbox prompt for interactive selection should also not be called
      expect(mockCheckbox).not.toHaveBeenCalled();
    });
  });

  describe("removal when skill not installed", () => {
    it("shows appropriate message for non-existent skill", async () => {
      // Manifest must have at least one skill to pass the early empty check
      mockLoadManifest.mockResolvedValue(
        makeManifest({ other: makeSkillEntry() }),
      );

      await runRemove("nonexistent", "--yes");

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("not installed"),
      );
      expect(mockOraSpinner.start).not.toHaveBeenCalled();
    });
  });

  describe("no skills installed", () => {
    it("shows message when manifest is empty", async () => {
      mockLoadManifest.mockResolvedValue(makeManifest({}));

      await runRemove("--all");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });

    it("shows message when manifest is null", async () => {
      mockLoadManifest.mockResolvedValue(null);

      await runRemove("--all");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });
  });

  describe("adapter removal failure", () => {
    it("logs warning but continues when adapter.remove fails", async () => {
      const targetDir = join(projectRoot, ".agents", "skills");
      await mkdir(join(targetDir, "test-skill"), { recursive: true });
      await writeFile(join(targetDir, "test-skill", "SKILL.md"), "# Test");

      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "test-skill": makeSkillEntry(),
        }),
      );

      const failingAdapter = {
        displayName: "FailAdapter",
        remove: vi.fn().mockRejectedValue(new Error("adapter broke")),
        install: vi.fn(),
      };
      mockGetEnabledAdapters.mockReturnValue([failingAdapter]);

      await runRemove("test-skill", "--yes");

      // Skill should still be removed successfully
      expect(mockOraSpinner.succeed).toHaveBeenCalledTimes(1);
      // Adapter failure logged as warning
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("adapter broke"),
      );
    });
  });
});
