import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest, SkillEntry } from "@curiouslycory/shared-types";

import { registerUpdateCommand } from "../../src/commands/update.js";
import { saveManifest } from "../../src/core/manifest.js";
import { fetchRepo } from "../../src/services/cache.js";

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
    process.exitCode = undefined;
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

  describe("single skill argument", () => {
    it("updates only the named skill", async () => {
      const oldHash = "oldhasholdhashold";
      mockInstallHash = "newhashnewhash12";
      mockManifest = makeManifest({
        "skill-a": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: oldHash,
          installedAt: "2026-01-01T00:00:00.000Z",
          agents: [],
        },
        "skill-b": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "untouchedhash123",
          installedAt: "2026-01-01T00:00:00.000Z",
          agents: [],
        },
      });

      await program.parseAsync(["node", "ms", "update", "skill-a"]);

      // Only skill-a should trigger saveManifest
      expect(saveManifest).toHaveBeenCalledTimes(1);
      const saved = vi.mocked(saveManifest).mock.calls[0][1] as unknown as Manifest;
      expect(saved.skills["skill-a"]).toHaveProperty("computedHash", "newhashnewhash12");
      expect(saved.skills["skill-b"]).toHaveProperty("computedHash", "untouchedhash123");
    });

    it("shows error when named skill is not installed", async () => {
      mockManifest = makeManifest({
        "other-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "somehash12345678",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "update", "missing-skill"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("not installed"),
      );
      expect(saveManifest).not.toHaveBeenCalled();
    });
  });

  describe("error paths", () => {
    it("shows error when fetch fails", async () => {
      vi.mocked(fetchRepo).mockRejectedValueOnce(new Error("Network timeout"));
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "abc12345abc12345",
          installedAt: new Date().toISOString(),
          agents: [],
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 failed"),
      );
    });

    it("sets process.exitCode = 1 when any skill fails", async () => {
      mockManifest = makeManifest({
        "local-skill": {
          source: "./local",
          sourceType: "local",
          computedHash: "abc12345abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      expect(process.exitCode).toBe(1);
    });

    it("shows unsupported source type message for non-github", async () => {
      mockManifest = makeManifest({
        "local-skill": {
          source: "./local",
          sourceType: "local",
          computedHash: "abc12345abc12345",
          installedAt: new Date().toISOString(),
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      // The spinner.fail message includes the source type
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 failed"),
      );
    });
  });

  describe("summary output", () => {
    it("shows correct mixed counts", async () => {
      vi.mocked(fetchRepo).mockRejectedValueOnce(new Error("fail"));
      mockManifest = makeManifest({
        "fail-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "failhash12345678",
          installedAt: new Date().toISOString(),
          agents: [],
        },
        "uptodate-skill": {
          source: "owner/other",
          sourceType: "github",
          computedHash: "newhashnewhash12",
          installedAt: new Date().toISOString(),
          agents: [],
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 already up-to-date"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 failed"),
      );
    });

    it("shows updated count after successful update", async () => {
      mockInstallHash = "newhashnewhash12";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "oldhasholdhashold",
          installedAt: "2026-01-01T00:00:00.000Z",
          agents: [],
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 updated"),
      );
    });

    it("verifies manifest hash and installedAt are changed on update", async () => {
      const oldDate = "2026-01-01T00:00:00.000Z";
      mockInstallHash = "brandnewhash1234";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "oldhasholdhashold",
          installedAt: oldDate,
          agents: [],
        },
      });

      await program.parseAsync(["node", "ms", "update"]);

      expect(saveManifest).toHaveBeenCalledTimes(1);
      const saved = vi.mocked(saveManifest).mock.calls[0][1] as unknown as Manifest;
      expect(saved.skills["test-skill"]).toHaveProperty("computedHash", "brandnewhash1234");
      expect(saved.skills["test-skill"]).toHaveProperty("installedAt");
      const installedAt = (saved.skills["test-skill"] as SkillEntry).installedAt;
      expect(installedAt).not.toBe(oldDate);
    });
  });
});
