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

  describe("checkSingleSkill error type distinction", () => {
    it("logs unsupported source type for non-github skills", async () => {
      mockManifest = makeManifest({
        "local-skill": {
          source: "./local",
          sourceType: "local",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('unsupported source type "local"'),
      );
    });

    it("logs actual error message on network failure", async () => {
      vi.mocked(fetchRepo).mockImplementation(() =>
        Promise.reject(new Error("ECONNREFUSED: connection refused")),
      );
      mockManifest = makeManifest({
        "net-fail": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("ECONNREFUSED: connection refused"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("remote unavailable"),
      );
    });

    it("logs actual error message when resolveSkill throws", async () => {
      const { resolveSkill } = await import(
        "../../src/core/skill-resolver.js"
      );
      vi.mocked(resolveSkill).mockImplementation(() =>
        Promise.reject(new Error('Skill "missing" not found in repository')),
      );
      mockManifest = makeManifest({
        missing: {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skill "missing" not found in repository'),
      );
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(fetchRepo).mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            reject("string error"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
          }),
      );
      mockManifest = makeManifest({
        "str-err": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("string error"),
      );
    });

    it("shows no-skills message when manifest is null", async () => {
      mockManifest = null;

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });

    it("shows no-skills message when manifest has empty skills", async () => {
      mockManifest = makeManifest({});

      await program.parseAsync(["node", "ms", "check"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No skills installed"),
      );
    });
  });
});
