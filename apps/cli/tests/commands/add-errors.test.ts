import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentId, Manifest } from "@curiouslycory/shared-types";

// ---------------------------------------------------------------------------
// Hoisted mocks — created before vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockFetchRepo,
  mockResolveSkill,
  mockInstallSkill,
  mockComputeSkillHash,
  mockGetEnabledAdapters,
  mockSaveManifest,
  mockOraSpinner,
} = vi.hoisted(() => {
  const spinner: Record<string, ReturnType<typeof vi.fn>> = {
    succeed: vi.fn(),
    fail: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
  };
  // start() returns the spinner itself (chainable)
  spinner.start.mockReturnValue(spinner);
  spinner.succeed.mockReturnValue(spinner);
  spinner.fail.mockReturnValue(spinner);
  spinner.stop.mockReturnValue(spinner);

  return {
    mockFetchRepo: vi.fn<[], Promise<string>>(),
    mockResolveSkill: vi.fn(),
    mockInstallSkill: vi.fn<[], Promise<string>>(),
    mockComputeSkillHash: vi.fn<[], Promise<string>>(),
    mockGetEnabledAdapters: vi.fn().mockReturnValue([]),
    mockSaveManifest: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    mockOraSpinner: spinner,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: mockFetchRepo,
  discoverSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/core/skill-resolver.js", () => ({
  resolveSkill: mockResolveSkill,
}));

vi.mock("../../src/core/skill-installer.js", () => ({
  installSkill: mockInstallSkill,
}));

vi.mock("../../src/core/skill-hasher.js", () => ({
  computeSkillHash: mockComputeSkillHash,
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: mockGetEnabledAdapters,
  resolveAgents: vi.fn().mockResolvedValue(["claude-code"]),
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn().mockResolvedValue(null),
  saveManifest: mockSaveManifest,
  addSkill: (
    manifest: { skills: Record<string, unknown> },
    name: string,
    entry: unknown,
  ) => ({
    ...manifest,
    skills: { ...manifest.skills, [name]: entry },
  }),
  getSkill: (
    manifest: { skills: Record<string, unknown> },
    name: string,
  ) => manifest.skills[name],
  removeSkill: vi.fn(),
}));

vi.mock("ora", () => ({
  default: () => mockOraSpinner,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import {
  installSingleSkill,
  restoreFromManifest,
} from "../../src/commands/add.js";
import type { GitHubSource } from "../../src/services/source-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeManifest(
  skills: Manifest["skills"] = {},
  agents: AgentId[] = ["claude-code"],
): Manifest {
  return { version: 1, agents, skills };
}

function makeGitHubSource(
  owner = "test-owner",
  repo = "test-repo",
): GitHubSource {
  return {
    type: "github",
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function makeResolvedSkill(name = "test-skill") {
  return {
    name,
    sourcePath: `/tmp/fake/${name}`,
    frontmatter: { name, description: "test" },
    content: `# ${name}`,
    files: ["SKILL.md"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
/**
 * Re-establish chainable returns on the ora spinner mock.
 * vi.restoreAllMocks() clears mockReturnValue set during vi.hoisted(),
 * so we must re-apply them before each test.
 */
function resetSpinnerMock(): void {
  mockOraSpinner.start.mockReturnValue(mockOraSpinner);
  mockOraSpinner.succeed.mockReturnValue(mockOraSpinner);
  mockOraSpinner.fail.mockReturnValue(mockOraSpinner);
  mockOraSpinner.stop.mockReturnValue(mockOraSpinner);
  mockGetEnabledAdapters.mockReturnValue([]);
  mockSaveManifest.mockResolvedValue(undefined);
}

describe("restoreFromManifest — error paths", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "add-err-"));
    resetSpinnerMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("skips skill with non-github sourceType and logs warning", async () => {
    const manifest = makeManifest({
      "local-skill": {
        source: "/some/path",
        sourceType: "local",
        computedHash: "abc",
        installedAt: new Date().toISOString(),
      },
    });

    const targetDir = join(projectRoot, ".agents", "skills");
    await restoreFromManifest(manifest, targetDir, projectRoot, [
      "claude-code",
    ]);

    expect(mockOraSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("unsupported source type"),
    );
  });

  it("re-installs when hash mismatches", async () => {
    // Seed a skill directory on disk so stat() finds it
    const targetDir = join(projectRoot, ".agents", "skills");
    const skillDir = join(targetDir, "stale-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "old content");

    // computeSkillHash returns a hash that differs from manifest
    mockComputeSkillHash.mockResolvedValue("local-hash-different");

    // Mock the fetch → resolve → install chain
    mockFetchRepo.mockResolvedValue("/tmp/cache/repo");
    mockResolveSkill.mockResolvedValue(makeResolvedSkill("stale-skill"));
    mockInstallSkill.mockResolvedValue("new-hash");

    const manifest = makeManifest({
      "stale-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "manifest-hash",
        installedAt: new Date().toISOString(),
      },
    });

    await restoreFromManifest(manifest, targetDir, projectRoot, [
      "claude-code",
    ]);

    expect(mockFetchRepo).toHaveBeenCalled();
    expect(mockResolveSkill).toHaveBeenCalledWith("stale-skill", "/tmp/cache/repo");
    expect(mockInstallSkill).toHaveBeenCalled();
    expect(mockOraSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Installed stale-skill"),
    );
  });

  it("logs error and continues when fetch fails for one skill", async () => {
    const targetDir = join(projectRoot, ".agents", "skills");

    // First skill: fetchRepo rejects
    mockFetchRepo
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce("/tmp/cache/repo");

    // Second skill: succeeds
    mockResolveSkill.mockResolvedValue(makeResolvedSkill("good-skill"));
    mockInstallSkill.mockResolvedValue("hash-good");

    const manifest = makeManifest({
      "bad-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc",
        installedAt: new Date().toISOString(),
      },
      "good-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "def",
        installedAt: new Date().toISOString(),
      },
    });

    await restoreFromManifest(manifest, targetDir, projectRoot, [
      "claude-code",
    ]);

    // First skill failed
    expect(mockOraSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("network timeout"),
    );
    // Second skill installed
    expect(mockOraSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Installed good-skill"),
    );
  });

  it("re-installs when hash computation throws", async () => {
    const targetDir = join(projectRoot, ".agents", "skills");
    const skillDir = join(targetDir, "broken-hash-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "content");

    // computeSkillHash throws
    mockComputeSkillHash.mockRejectedValue(new Error("hash failed"));

    // Install chain succeeds
    mockFetchRepo.mockResolvedValue("/tmp/cache/repo");
    mockResolveSkill.mockResolvedValue(
      makeResolvedSkill("broken-hash-skill"),
    );
    mockInstallSkill.mockResolvedValue("new-hash");

    const manifest = makeManifest({
      "broken-hash-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "expected-hash",
        installedAt: new Date().toISOString(),
      },
    });

    await restoreFromManifest(manifest, targetDir, projectRoot, [
      "claude-code",
    ]);

    // Should have fallen through to install path
    expect(mockFetchRepo).toHaveBeenCalled();
    expect(mockOraSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Installed broken-hash-skill"),
    );
  });
});

describe("installSingleSkill — error paths", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "install-err-"));
    resetSpinnerMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("shows skill-not-found error when resolveSkill throws with that message", async () => {
    mockResolveSkill.mockRejectedValue(
      new Error('Skill "missing-skill" not found in repository'),
    );

    const manifest = makeManifest();
    const result = await installSingleSkill(
      "missing-skill",
      makeGitHubSource(),
      "/tmp/cache",
      join(projectRoot, ".agents", "skills"),
      projectRoot,
      manifest,
      ["claude-code"],
    );

    expect(mockOraSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to install missing-skill"),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("not found in the repository"),
    );
    // Returns the original manifest unchanged
    expect(result).toBe(manifest);
  });

  it("sets process.exitCode = 1 on failure", async () => {
    mockResolveSkill.mockRejectedValue(new Error("something broke"));

    const manifest = makeManifest();
    await installSingleSkill(
      "fail-skill",
      makeGitHubSource(),
      "/tmp/cache",
      join(projectRoot, ".agents", "skills"),
      projectRoot,
      manifest,
      ["claude-code"],
    );

    expect(process.exitCode).toBe(1);
  });

  it("returns updated manifest on success", async () => {
    const resolved = makeResolvedSkill("new-skill");
    mockResolveSkill.mockResolvedValue(resolved);
    mockInstallSkill.mockResolvedValue("computed-hash-123");

    const manifest = makeManifest();
    const result = await installSingleSkill(
      "new-skill",
      makeGitHubSource("owner", "repo"),
      "/tmp/cache",
      join(projectRoot, ".agents", "skills"),
      projectRoot,
      manifest,
      ["claude-code"],
    );

    // Manifest should now contain the new skill
    expect(result.skills["new-skill"]).toBeDefined();
    expect(result.skills["new-skill"]?.source).toBe("owner/repo");
    expect(result.skills["new-skill"]?.sourceType).toBe("github");
    expect(result.skills["new-skill"]?.computedHash).toBe("computed-hash-123");
    expect(result.skills["new-skill"]?.installedAt).toBeDefined();
    expect(result.skills["new-skill"]?.agents).toEqual(["claude-code"]);

    expect(mockSaveManifest).toHaveBeenCalled();
    expect(mockOraSpinner.succeed).toHaveBeenCalled();
  });
});
