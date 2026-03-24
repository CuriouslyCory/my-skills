import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

import { registerCheckCommand } from "../../src/commands/check.js";
import { fetchRepo } from "../../src/services/cache.js";

let mockManifest: Manifest | null = null;

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => Promise.resolve(mockManifest)),
}));

vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: vi.fn(() => Promise.resolve("/tmp/fake-cache")),
}));

vi.mock("../../src/core/skill-resolver.js", () => ({
  resolveSkill: vi.fn(() => Promise.resolve({ sourcePath: "/tmp/fake-skill" })),
}));

let mockRemoteHash = "newhash1newhash1";

vi.mock("../../src/core/skill-hasher.js", () => ({
  computeSkillHash: vi.fn(() => Promise.resolve(mockRemoteHash)),
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

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

describe("check command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerCheckCommand(program);

    mockManifest = null;
    mockRemoteHash = "newhash1newhash1";

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints empty-state message when no skills installed", async () => {
    await program.parseAsync(["node", "ms", "check"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills installed"),
    );
  });

  it("reports 'up-to-date' when hashes match", async () => {
    const hash = "abc12345abc12345";
    mockRemoteHash = hash;
    mockManifest = makeManifest({
      "my-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: hash,
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "check"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("up-to-date"),
    );
  });

  it("reports 'update available' when hashes differ", async () => {
    mockRemoteHash = "newhashnewhashnew";
    mockManifest = makeManifest({
      "my-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "oldhasholdhashold",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "check"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("update available"),
    );
  });

  it("reports 'remote unavailable' for non-github sourceType", async () => {
    mockManifest = makeManifest({
      "local-skill": {
        source: "./local",
        sourceType: "local",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "check"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("remote unavailable"),
    );
  });

  it("reports 'remote unavailable' when fetchRepo throws", async () => {
    vi.mocked(fetchRepo).mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );
    mockManifest = makeManifest({
      "broken-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc12345",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "check"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("remote unavailable"),
    );
  });
});
