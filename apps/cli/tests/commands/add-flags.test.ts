import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentId } from "@curiouslycory/shared-types";

// ---------------------------------------------------------------------------
// Hoisted mocks — created before vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockFetchRepo,
  mockDiscoverSkills,
  mockResolveSkill,
  mockInstallSkill,
  mockLoadConfig,
  mockSaveConfig,
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
    mockFetchRepo: vi.fn<[], Promise<string>>().mockResolvedValue("/tmp/cache"),
    mockDiscoverSkills: vi.fn().mockResolvedValue([]),
    mockResolveSkill: vi.fn(),
    mockInstallSkill: vi.fn<[], Promise<string>>().mockResolvedValue("hash123"),
    mockLoadConfig: vi.fn().mockResolvedValue({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    }),
    mockSaveConfig: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
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
vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: mockFetchRepo,
  discoverSkills: mockDiscoverSkills,
}));

vi.mock("../../src/core/skill-resolver.js", () => ({
  resolveSkill: mockResolveSkill,
}));

vi.mock("../../src/core/skill-installer.js", () => ({
  installSkill: mockInstallSkill,
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: mockLoadManifest,
  saveManifest: mockSaveManifest,
  addSkill: (
    manifest: { skills: Record<string, unknown> },
    name: string,
    entry: unknown,
  ) => ({
    ...manifest,
    skills: { ...manifest.skills, [name]: entry },
  }),
  getSkill: (manifest: { skills: Record<string, unknown> }, name: string) =>
    manifest.skills[name],
  removeSkill: vi.fn(),
}));

vi.mock("../../src/core/migration.js", () => ({
  migrateFromSkillsLock: vi.fn().mockResolvedValue(null),
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
import { registerAddCommand } from "../../src/commands/add.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeResolvedSkill(name = "test-skill") {
  return {
    name,
    sourcePath: `/tmp/fake/${name}`,
    frontmatter: { name, description: "test" },
    content: `# ${name}`,
    files: ["SKILL.md"],
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit
  registerAddCommand(program);
  return program;
}

async function runAdd(...args: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(["node", "ms", "add", ...args]);
}

/**
 * Re-establish chainable returns on the ora spinner mock.
 */
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
describe("add command — flag tests", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "add-flags-"));
    resetSpinnerMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
    process.exitCode = undefined;

    // Reset mocks to defaults
    mockFetchRepo.mockResolvedValue("/tmp/cache");
    mockDiscoverSkills.mockResolvedValue([]);
    mockLoadManifest.mockResolvedValue(null);
    mockLoadConfig.mockResolvedValue({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    });
    mockSaveConfig.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("--list flag", () => {
    it("shows discovered skills without installing", async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: "skill-a", description: "Skill A desc" },
        { name: "skill-b", description: "Skill B desc" },
      ]);

      await runAdd("owner/repo", "--list");

      expect(mockDiscoverSkills).toHaveBeenCalledWith("/tmp/cache");
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("skill-a"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("skill-b"),
      );
      // Should NOT have tried to install
      expect(mockResolveSkill).not.toHaveBeenCalled();
      expect(mockInstallSkill).not.toHaveBeenCalled();
    });

    it("shows message when no skills found", async () => {
      mockDiscoverSkills.mockResolvedValue([]);

      await runAdd("owner/repo", "--list");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills found"),
      );
    });
  });

  describe("--all flag", () => {
    it("sets --skill * --agent * -y shorthand and installs all skills", async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: "s1", description: "d1" },
        { name: "s2", description: "d2" },
      ]);
      mockResolveSkill
        .mockResolvedValueOnce(makeResolvedSkill("s1"))
        .mockResolvedValueOnce(makeResolvedSkill("s2"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo", "--all");

      // Should install both discovered skills
      expect(mockResolveSkill).toHaveBeenCalledWith("s1", "/tmp/cache");
      expect(mockResolveSkill).toHaveBeenCalledWith("s2", "/tmp/cache");
      expect(mockInstallSkill).toHaveBeenCalledTimes(2);
      // Should NOT have shown the interactive picker
      expect(mockCheckbox).not.toHaveBeenCalled();
    });
  });

  describe("--skill flag", () => {
    it("parses comma-separated skill names correctly", async () => {
      mockResolveSkill
        .mockResolvedValueOnce(makeResolvedSkill("skill1"))
        .mockResolvedValueOnce(makeResolvedSkill("skill2"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo", "--skill", "skill1,skill2");

      expect(mockResolveSkill).toHaveBeenCalledWith("skill1", "/tmp/cache");
      expect(mockResolveSkill).toHaveBeenCalledWith("skill2", "/tmp/cache");
      expect(mockInstallSkill).toHaveBeenCalledTimes(2);
    });

    it("installs all when --skill '*' is used", async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: "a", description: "da" },
        { name: "b", description: "db" },
      ]);
      mockResolveSkill
        .mockResolvedValueOnce(makeResolvedSkill("a"))
        .mockResolvedValueOnce(makeResolvedSkill("b"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo", "--skill", "*");

      expect(mockDiscoverSkills).toHaveBeenCalled();
      expect(mockResolveSkill).toHaveBeenCalledTimes(2);
    });
  });

  describe("--agent flag", () => {
    it("validates and uses comma-separated agent IDs", async () => {
      mockResolveSkill.mockResolvedValue(makeResolvedSkill("test-skill"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo/test-skill", "--agent", "claude-code,cursor");

      // installSingleSkill should have been called with the parsed agents
      expect(mockSaveManifest).toHaveBeenCalled();
    });

    it("shows error for invalid agent ID", async () => {
      await runAdd("owner/repo/test-skill", "--agent", "invalid-agent");

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid agent ID"),
      );
      // Should not attempt to install
      expect(mockResolveSkill).not.toHaveBeenCalled();
    });
  });

  describe("--favorite flag", () => {
    it("adds repo URL to config.favoriteRepos", async () => {
      mockResolveSkill.mockResolvedValue(makeResolvedSkill("test-skill"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo/test-skill", "--favorite");

      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteRepos: expect.arrayContaining([
            "https://github.com/owner/repo.git",
          ]) as string[],
        }),
      );
    });

    it("does not duplicate repo in favorites if already present", async () => {
      mockLoadConfig.mockResolvedValue({
        defaultAgents: [],
        favoriteRepos: ["https://github.com/owner/repo.git"],
        cacheDir: "/tmp/cache",
        skillsDir: ".agents/skills",
        autoDetectAgents: true,
        symlinkBehavior: "copy",
      });
      mockResolveSkill.mockResolvedValue(makeResolvedSkill("test-skill"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo/test-skill", "--favorite");

      expect(mockSaveConfig).not.toHaveBeenCalled();
    });
  });

  describe("--global flag", () => {
    it("changes target directory to ~/.agents/skills", async () => {
      mockResolveSkill.mockResolvedValue(makeResolvedSkill("test-skill"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo/test-skill", "--global");

      // installSkill should receive the global path
      const { homedir } = await import("node:os");
      const expectedDir = join(homedir(), ".agents", "skills");
      expect(mockInstallSkill).toHaveBeenCalledWith(
        expect.objectContaining({ name: "test-skill" }),
        expectedDir,
      );
    });
  });

  describe("--yes flag", () => {
    it("skips interactive prompts and installs all discovered skills", async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: "s1", description: "d1" },
        { name: "s2", description: "d2" },
      ]);
      mockResolveSkill
        .mockResolvedValueOnce(makeResolvedSkill("s1"))
        .mockResolvedValueOnce(makeResolvedSkill("s2"));
      mockInstallSkill.mockResolvedValue("hash");

      await runAdd("owner/repo", "--yes");

      // Should install all without prompting
      expect(mockCheckbox).not.toHaveBeenCalled();
      expect(mockResolveSkill).toHaveBeenCalledTimes(2);
    });
  });
});
