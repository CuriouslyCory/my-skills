import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockLoadConfig,
  mockLoadManifest,
  mockSaveManifest,
  mockResolveAgents,
  mockGetEnabledAdapters,
  mockCheckbox,
  mockRemoveSingleSkill,
  mockOraSpinner,
  mockHomedir,
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
    mockRemoveSingleSkill: vi.fn(),
    mockOraSpinner: spinner,
    mockHomedir: vi.fn(),
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

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

vi.mock("../../src/commands/remove.js", () => ({
  removeSingleSkill: mockRemoveSingleSkill,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { registerListCommand } from "../../src/commands/list.js";

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
    computedHash: "abc12345deadbeef",
    installedAt: new Date().toISOString(),
    agents: ["claude-code"],
    ...overrides,
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerListCommand(program);
  return program;
}

async function runList(...args: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(["node", "ms", "list", ...args]);
}

function resetSpinnerMock(): void {
  mockOraSpinner.start.mockReturnValue(mockOraSpinner);
  mockOraSpinner.succeed.mockReturnValue(mockOraSpinner);
  mockOraSpinner.fail.mockReturnValue(mockOraSpinner);
  mockOraSpinner.stop.mockReturnValue(mockOraSpinner);
}

function getJsonOutput(): unknown[] {
  const jsonCall = vi
    .mocked(console.log)
    .mock.calls.find(
      (call): call is [string] =>
        typeof call[0] === "string" && call[0].startsWith("["),
    );
  if (!jsonCall) throw new Error("No JSON output found");
  return JSON.parse(jsonCall[0]) as unknown[];
}

function validSkillMd(name: string, description = "A test skill"): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
    "Some content.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("list command — extended tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "list-ext-"));
    resetSpinnerMock();
    mockHomedir.mockReturnValue(tempDir);

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    // Reset mocks to defaults (vi.restoreAllMocks clears hoisted return values)
    mockLoadManifest.mockResolvedValue(null);
    mockLoadConfig.mockResolvedValue({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    });
    mockResolveAgents.mockResolvedValue(["claude-code"]);
    mockCheckbox.mockResolvedValue([]);
    mockRemoveSingleSkill.mockImplementation(
      (
        _name: string,
        _targetDir: string,
        _projectRoot: string,
        manifest: Manifest,
      ) => Promise.resolve(manifest),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // scanSkillsDir — ENOENT
  // -----------------------------------------------------------------------
  describe("scanSkillsDir with ENOENT", () => {
    it("returns empty array when global skills directory does not exist", async () => {
      // homedir points to tempDir — no .agents/skills created
      await runList("--global");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // scanSkillsDir — invalid SKILL.md
  // -----------------------------------------------------------------------
  describe("scanSkillsDir with invalid SKILL.md", () => {
    it("skips invalid skill and returns other valid skills", async () => {
      const skillsDir = join(tempDir, ".agents", "skills");

      // Valid skill
      await mkdir(join(skillsDir, "good-skill"), { recursive: true });
      await writeFile(
        join(skillsDir, "good-skill", "SKILL.md"),
        validSkillMd("good-skill"),
      );

      // Invalid skill — bad YAML frontmatter
      await mkdir(join(skillsDir, "bad-skill"), { recursive: true });
      await writeFile(
        join(skillsDir, "bad-skill", "SKILL.md"),
        "not valid yaml frontmatter at all",
      );

      await runList("--global", "--json");

      const parsed = getJsonOutput();
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty("name", "good-skill");
    });

    it("returns empty when all skills have invalid SKILL.md", async () => {
      const skillsDir = join(tempDir, ".agents", "skills");
      await mkdir(join(skillsDir, "broken"), { recursive: true });
      await writeFile(join(skillsDir, "broken", "SKILL.md"), "garbage");

      await runList("--global");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // --interactive flag
  // -----------------------------------------------------------------------
  describe("--interactive flag", () => {
    it("shows checkbox and triggers removal for selected skills", async () => {
      const manifest = makeManifest({
        "skill-a": makeSkillEntry(),
        "skill-b": makeSkillEntry(),
      });
      mockLoadManifest.mockResolvedValue(manifest);
      mockCheckbox.mockResolvedValue(["skill-a"]);

      // removeSingleSkill returns manifest without the removed skill
      mockRemoveSingleSkill.mockImplementation(
        (
          name: string,
          _targetDir: string,
          _projectRoot: string,
          m: Manifest,
        ) => {
          const { [name]: _, ...rest } = m.skills;
          return Promise.resolve({ ...m, skills: rest });
        },
      );

      await runList("--interactive");

      // checkbox should have been presented with both skills
      expect(mockCheckbox).toHaveBeenCalledTimes(1);
      const checkboxArg = mockCheckbox.mock.calls[0][0] as unknown as {
        choices: { value: string }[];
      };
      const choiceValues = checkboxArg.choices.map(
        (c: { value: string }) => c.value,
      );
      expect(choiceValues).toContain("skill-a");
      expect(choiceValues).toContain("skill-b");

      // removeSingleSkill should have been called for the selected skill
      expect(mockRemoveSingleSkill).toHaveBeenCalledTimes(1);
      const removeArgs = mockRemoveSingleSkill.mock
        .calls[0] as unknown as string[];
      expect(removeArgs[0]).toBe("skill-a");
    });

    it("shows 'No skills selected' when user selects nothing", async () => {
      mockLoadManifest.mockResolvedValue(
        makeManifest({ "skill-a": makeSkillEntry() }),
      );
      mockCheckbox.mockResolvedValue([]);

      await runList("--interactive");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills selected"),
      );
      expect(mockRemoveSingleSkill).not.toHaveBeenCalled();
    });

    it("shows 'No manifest found' when manifest is null during removal", async () => {
      // First call returns manifest (for listing), second returns null (for removal)
      mockLoadManifest
        .mockResolvedValueOnce(
          makeManifest({ "skill-a": makeSkillEntry() }),
        )
        .mockResolvedValueOnce(null);
      mockCheckbox.mockResolvedValue(["skill-a"]);

      await runList("--interactive");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No manifest found"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // --json output format
  // -----------------------------------------------------------------------
  describe("--json output format", () => {
    it("outputs valid JSON array with skill data", async () => {
      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "alpha-skill": makeSkillEntry({
            source: "owner/alpha",
            computedHash: "1111222233334444",
          }),
          "beta-skill": makeSkillEntry({
            source: "owner/beta",
            computedHash: "5555666677778888",
            agents: ["cursor"],
          }),
        }),
      );

      await runList("--json");

      const parsed = getJsonOutput() as {
        name: string;
        source: string;
        hash: string;
        agents: string[];
      }[];
      expect(parsed).toHaveLength(2);

      const alpha = parsed.find((s) => s.name === "alpha-skill");
      expect(alpha).toEqual(
        expect.objectContaining({
          source: "owner/alpha",
          hash: "11112222",
          agents: ["claude-code"],
        }),
      );

      const beta = parsed.find((s) => s.name === "beta-skill");
      expect(beta).toEqual(
        expect.objectContaining({
          source: "owner/beta",
          agents: ["cursor"],
        }),
      );
    });

    it("outputs '[]' when no skills match filters", async () => {
      mockLoadManifest.mockResolvedValue(
        makeManifest({
          "my-skill": makeSkillEntry({ agents: ["cursor"] }),
        }),
      );

      await runList("--json", "--agent", "claude-code");

      expect(console.log).toHaveBeenCalledWith("[]");
    });
  });
});
