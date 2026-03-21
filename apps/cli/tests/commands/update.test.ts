import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

let mockManifest: Manifest | null = null;

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => Promise.resolve(mockManifest)),
  saveManifest: vi.fn(() => Promise.resolve(undefined)),
  addSkill: vi.fn(
    (m: Manifest, name: string, entry: Manifest["skills"][string]) => ({
      ...m,
      skills: { ...m.skills, [name]: entry },
    }),
  ),
  getSkill: vi.fn((m: Manifest, name: string) => m.skills[name]),
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    }),
  ),
}));

vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: vi.fn(() => Promise.resolve("/tmp/fake-cache")),
}));

vi.mock("../../src/core/skill-resolver.js", () => ({
  resolveSkill: vi.fn(() =>
    Promise.resolve({
      sourcePath: "/tmp/fake-skill",
      name: "test-skill",
      files: [],
    }),
  ),
}));

let mockInstallHash = "newhashnewhash12";

vi.mock("../../src/core/skill-installer.js", () => ({
  installSkill: vi.fn(() => Promise.resolve(mockInstallHash)),
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: vi.fn(() => []),
}));

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

import { saveManifest } from "../../src/core/manifest.js";
import { registerUpdateCommand } from "../../src/commands/update.js";

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

describe("update command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerUpdateCommand(program);

    mockManifest = null;
    mockInstallHash = "newhashnewhash12";

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints empty-state message when no skills installed", async () => {
    await program.parseAsync(["node", "ms", "update"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills installed"),
    );
  });

  it("updates skill when hash has changed", async () => {
    const oldHash = "oldhasholdhashold";
    mockInstallHash = "newhashnewhash12";
    mockManifest = makeManifest({
      "test-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: oldHash,
        installedAt: new Date().toISOString(),
        agents: [],
      },
    });

    await program.parseAsync(["node", "ms", "update"]);

    expect(saveManifest).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("1 updated"),
    );
  });

  it("reports 'already up to date' when hash matches", async () => {
    const hash = "samehashsamehash";
    mockInstallHash = hash;
    mockManifest = makeManifest({
      "test-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: hash,
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "update"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("1 already up-to-date"),
    );
  });

  it("reports error for non-existent skill name argument", async () => {
    mockManifest = makeManifest({
      "real-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "update", "nonexistent"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("not installed"),
    );
  });

  it("fails for non-github sourceType", async () => {
    mockManifest = makeManifest({
      "local-skill": {
        source: "./local",
        sourceType: "local",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "update"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("1 failed"),
    );
  });
});
