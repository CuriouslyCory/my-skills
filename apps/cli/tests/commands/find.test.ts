import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config, Manifest } from "@curiouslycory/shared-types";

let mockManifest: Manifest | null = null;
let mockConfig: Config;

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => Promise.resolve(mockManifest)),
  getSkill: vi.fn((m: Manifest | null, name: string) => m?.skills[name]),
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() => Promise.resolve(mockConfig)),
}));

vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: vi.fn(() => Promise.resolve("/tmp/fake-cache")),
  getCachedRepoPath: vi.fn(() => Promise.resolve("/tmp/fake-cache")),
  isCacheStale: vi.fn(() => Promise.resolve(false)),
  discoverSkills: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../src/services/source-parser.js", () => ({
  parseSource: vi.fn((source: string) => {
    const clean = source.replace("https://github.com/", "").replace(".git", "");
    const [owner, repo] = clean.split("/");
    return {
      type: "github",
      owner,
      repo,
      skill: undefined,
      url: `https://github.com/${owner ?? ""}/${repo ?? ""}.git`,
    };
  }),
}));

vi.mock("../../src/adapters/index.js", () => ({
  resolveAgents: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../src/core/migration.js", () => ({
  migrateFromSkillsLock: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../src/commands/add.js", () => ({
  installSingleSkill: vi.fn(
    (
      _name: string,
      _src: unknown,
      _cache: string,
      _target: string,
      _root: string,
      manifest: Manifest,
    ) => Promise.resolve(manifest),
  ),
}));

vi.mock("@inquirer/checkbox", () => ({
  default: vi.fn(() => Promise.resolve([])),
}));

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    set text(_v: string) {
      /* noop */
    },
  }),
}));

import { discoverSkills } from "../../src/services/cache.js";
import checkbox from "@inquirer/checkbox";
import { registerFindCommand } from "../../src/commands/find.js";

describe("find command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerFindCommand(program);

    mockManifest = null;
    mockConfig = {
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    };

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints empty-state message when no skills and no favorites", async () => {
    await program.parseAsync(["node", "ms", "find"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills found"),
    );
  });

  it("shows installed skills from manifest in results", async () => {
    mockManifest = {
      version: 1,
      agents: [],
      skills: {
        "installed-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      },
    };

    vi.mocked(checkbox).mockImplementation(() => Promise.resolve([]));

    await program.parseAsync(["node", "ms", "find"]);

    expect(checkbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({
            value: "installed-skill",
            disabled: "already installed",
          }),
        ]) as unknown,
      }),
    );
  });

  it("prints 'No skills matching' when query matches nothing", async () => {
    mockManifest = {
      version: 1,
      agents: [],
      skills: {
        "some-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      },
    };

    await program.parseAsync(["node", "ms", "find", "nonexistent-query"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills matching"),
    );
  });

  it("discovers skills from favorite repos", async () => {
    mockConfig.favoriteRepos = ["https://github.com/owner/repo.git"];
    vi.mocked(discoverSkills).mockImplementation(() =>
      Promise.resolve([
        { name: "discovered-skill", description: "A discovered skill", sourcePath: "/tmp/skill" },
      ]),
    );

    vi.mocked(checkbox).mockImplementation(() => Promise.resolve([]));

    await program.parseAsync(["node", "ms", "find"]);

    expect(checkbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({
            value: "discovered-skill",
          }),
        ]) as unknown,
      }),
    );
  });
});
