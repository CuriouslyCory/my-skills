import { stat } from "node:fs/promises";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

import { AuthRequiredError } from "../../src/core/api-client.js";
import { registerApplyCommand, runApply } from "../../src/commands/apply.js";
import { saveManifest } from "../../src/core/manifest.js";
import { installSkill } from "../../src/core/skill-installer.js";
import { resolveSkill } from "../../src/core/skill-resolver.js";
import { fetchRepo } from "../../src/services/cache.js";
import { createCloudClient } from "../../src/services/cloud-source.js";

let mockManifest: Manifest | null = null;

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(() => Promise.resolve({})),
  rm: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => Promise.resolve(mockManifest)),
  saveManifest: vi.fn(() => Promise.resolve(undefined)),
  addSkill: vi.fn(
    (m: Manifest, name: string, entry: Manifest["skills"][string]) => ({
      ...m,
      skills: { ...m.skills, [name]: entry },
    }),
  ),
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
      serverUrl: "https://my-skills.dev",
    }),
  ),
}));

let mockLocalHash = "installedhash000";

vi.mock("../../src/core/skill-hasher.js", () => ({
  computeSkillHash: vi.fn(() => Promise.resolve(mockLocalHash)),
}));

vi.mock("../../src/services/cache.js", () => ({
  fetchRepo: vi.fn(() => Promise.resolve("/tmp/fake-cache")),
}));

vi.mock("../../src/core/skill-resolver.js", () => ({
  resolveSkill: vi.fn(() =>
    Promise.resolve({
      name: "test-skill",
      sourcePath: "/tmp/fake-skill",
      frontmatter: { name: "test-skill", description: "" },
      content: "",
      files: [],
    }),
  ),
}));

let mockInstallHash = "installedhash000";

vi.mock("../../src/core/skill-installer.js", () => ({
  installSkill: vi.fn(() => Promise.resolve(mockInstallHash)),
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: vi.fn(() => []),
  detectAgents: vi.fn(() => Promise.resolve([])),
}));

const cloudCleanup = vi.fn(() => Promise.resolve());

vi.mock("../../src/services/cloud-source.js", () => ({
  createCloudClient: vi.fn(() =>
    Promise.resolve({ client: {}, serverUrl: "https://srv.example" }),
  ),
  fetchCloudArtifact: vi.fn(() =>
    Promise.resolve({
      id: "id-1",
      name: "cloud-skill",
      description: "d",
      category: "skill",
      content: "body",
      author: null,
      version: null,
      tags: [],
      updatedAt: new Date(),
    }),
  ),
  materializeCloudArtifact: vi.fn(() =>
    Promise.resolve({
      resolved: {
        name: "cloud-skill",
        sourcePath: "/tmp/cloud-skill",
        frontmatter: { name: "cloud-skill", description: "" },
        content: "",
        files: ["SKILL.md"],
      },
      category: "skill",
      cleanup: cloudCleanup,
    }),
  ),
  cloudDeployDir: vi.fn(
    (root: string, category: string) => `${root}/.agents/${category}s`,
  ),
  normalizeCategory: vi.fn((c: string | null | undefined) => c ?? "skill"),
}));

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

/** Make stat resolve (file exists) or reject (missing). */
function setInstalled(exists: boolean): void {
  if (exists) {
    vi.mocked(stat).mockResolvedValue({} as never);
  } else {
    vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));
  }
}

const ORIGINAL_ENV = { ...process.env };

describe("apply command", () => {
  beforeEach(() => {
    mockManifest = null;
    mockLocalHash = "installedhash000";
    mockInstallHash = "installedhash000";
    setInstalled(true);

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    delete process.env.MY_SKILLS_SKIP;
    delete process.env.MY_SKILLS_CI;
    delete process.env.CI;
    delete process.env.INIT_CWD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchRepo).mockResolvedValue("/tmp/fake-cache");
    process.exitCode = undefined;
    process.env = { ...ORIGINAL_ENV };
  });

  describe("reconcile actions", () => {
    it("no-ops when installed hash matches the manifest", async () => {
      const hash = "matchinghash1234";
      mockLocalHash = hash;
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(0);
      expect(outcome.results[0]?.action).toBe("noop");
      expect(installSkill).not.toHaveBeenCalled();
    });

    it("installs a skill that is missing on disk", async () => {
      mockInstallHash = "matchinghash1234";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "matchinghash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(0);
      expect(outcome.results[0]?.action).toBe("install");
      expect(installSkill).toHaveBeenCalledTimes(1);
    });

    it("updates a skill whose on-disk hash drifted from the manifest", async () => {
      mockLocalHash = "driftedhash99999";
      mockInstallHash = "manifesthash1234";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(0);
      expect(outcome.results[0]?.action).toBe("update");
      expect(installSkill).toHaveBeenCalledTimes(1);
    });

    it("resolves local sources without hitting the network", async () => {
      mockManifest = makeManifest({
        "test-skill": {
          source: "./local/skills",
          sourceType: "local",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);
      mockInstallHash = "manifesthash1234";

      const outcome = await runApply({});

      expect(outcome.results[0]?.action).toBe("install");
      expect(fetchRepo).not.toHaveBeenCalled();
      expect(resolveSkill).toHaveBeenCalledWith(
        "test-skill",
        expect.stringContaining("local/skills"),
      );
    });
  });

  describe("cloud (@me) entries", () => {
    it("applies a cloud entry when a token is available", async () => {
      mockInstallHash = "cloudhash00000000";
      mockManifest = makeManifest({
        "cloud-skill": {
          source: "@me/cloud-skill",
          sourceType: "cloud",
          category: "skill",
          computedHash: "cloudhash00000000",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(0);
      expect(outcome.results[0]?.action).toBe("install");
      expect(installSkill).toHaveBeenCalledWith(
        expect.objectContaining({ name: "cloud-skill" }),
        expect.stringContaining(".agents/skills"),
      );
      expect(cloudCleanup).toHaveBeenCalled();
    });

    it("fails a cloud entry clearly without a token but still applies others", async () => {
      vi.mocked(createCloudClient).mockRejectedValueOnce(
        new AuthRequiredError(
          "Not logged in. Set MY_SKILLS_TOKEN or run `ms login`.",
        ),
      );
      mockInstallHash = "githubhash00000000";
      mockManifest = makeManifest({
        "cloud-skill": {
          source: "@me/cloud-skill",
          sourceType: "cloud",
          category: "skill",
          computedHash: "cloudhash00000000",
          installedAt: new Date().toISOString(),
        },
        "gh-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "githubhash00000000",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({});

      // Partial failure: cloud entry failed, github entry installed, exit 1.
      expect(outcome.exitCode).toBe(1);
      const cloud = outcome.results.find((r) => r.name === "cloud-skill");
      const gh = outcome.results.find((r) => r.name === "gh-skill");
      expect(cloud?.action).toBe("failed");
      expect(cloud?.error).toContain("ms login");
      expect(gh?.action).toBe("install");
    });

    it("never fails the host install on a token-less cloud entry in hook mode", async () => {
      vi.mocked(createCloudClient).mockRejectedValueOnce(
        new AuthRequiredError("Not logged in."),
      );
      mockManifest = makeManifest({
        "cloud-skill": {
          source: "@me/cloud-skill",
          sourceType: "cloud",
          category: "skill",
          computedHash: "cloudhash00000000",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({ hook: true });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("error");
      expect(outcome.results[0]?.action).toBe("failed");
    });
  });

  describe("manifest drift persistence + idempotency", () => {
    it("saves the manifest when the installed hash differs from the lock", async () => {
      mockInstallHash = "brandnewhash0000";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "oldlockhash00000",
          installedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      setInstalled(false);

      await runApply({});

      expect(saveManifest).toHaveBeenCalledTimes(1);
      const saved = vi.mocked(saveManifest).mock.calls[0]?.[1];
      expect(saved?.skills["test-skill"]?.computedHash).toBe(
        "brandnewhash0000",
      );
    });

    it("does not save the manifest when nothing changes", async () => {
      const hash = "steadyhash000000";
      mockLocalHash = hash;
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      await runApply({});

      expect(saveManifest).not.toHaveBeenCalled();
    });
  });

  describe("--frozen", () => {
    it("exits 2 when a skill would change and makes no modifications", async () => {
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({ frozen: true });

      expect(outcome.exitCode).toBe(2);
      expect(outcome.status).toBe("frozen-drift");
      expect(installSkill).not.toHaveBeenCalled();
      expect(saveManifest).not.toHaveBeenCalled();
    });

    it("exits 0 when everything is already in sync", async () => {
      const hash = "insynchash000000";
      mockLocalHash = hash;
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      const outcome = await runApply({ frozen: true });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("applied");
    });
  });

  describe("empty / missing manifest", () => {
    it("skips (exit 0) when there is no manifest", async () => {
      mockManifest = null;

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("skipped");
    });

    it("skips (exit 0) when the manifest has no skills", async () => {
      mockManifest = makeManifest({});

      const outcome = await runApply({});

      expect(outcome.status).toBe("skipped");
    });
  });

  describe("hook safety", () => {
    it("skips when MY_SKILLS_SKIP=1", async () => {
      process.env.MY_SKILLS_SKIP = "1";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "h",
          installedAt: new Date().toISOString(),
        },
      });

      const outcome = await runApply({ hook: true });

      expect(outcome.status).toBe("skipped");
      expect(outcome.reason).toContain("MY_SKILLS_SKIP");
      expect(installSkill).not.toHaveBeenCalled();
    });

    it("skips under CI unless MY_SKILLS_CI=1", async () => {
      process.env.CI = "true";
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "h",
          installedAt: new Date().toISOString(),
        },
      });

      const outcome = await runApply({ hook: true });

      expect(outcome.status).toBe("skipped");
      expect(outcome.reason).toContain("CI");
    });

    it("runs under CI when MY_SKILLS_CI=1", async () => {
      process.env.CI = "true";
      process.env.MY_SKILLS_CI = "1";
      const hash = "cihash0000000000";
      mockLocalHash = hash;
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      const outcome = await runApply({ hook: true });

      expect(outcome.status).toBe("applied");
    });

    it("never fails the host install on a network error in hook mode", async () => {
      vi.mocked(fetchRepo).mockRejectedValueOnce(new Error("network down"));
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({ hook: true });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("error");
      expect(outcome.results[0]?.action).toBe("failed");
    });

    it("exits 1 on a network error when NOT in hook mode", async () => {
      vi.mocked(fetchRepo).mockRejectedValueOnce(new Error("network down"));
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      const outcome = await runApply({});

      expect(outcome.exitCode).toBe(1);
    });

    it("resolves the project root from INIT_CWD", async () => {
      process.env.INIT_CWD = "/host/project";
      mockManifest = makeManifest({
        "test-skill": {
          source: "./local",
          sourceType: "local",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);
      mockInstallHash = "manifesthash1234";

      await runApply({ hook: true });

      expect(resolveSkill).toHaveBeenCalledWith(
        "test-skill",
        expect.stringContaining("/host/project"),
      );
    });
  });

  describe("command wiring + exit codes", () => {
    let program: Command;

    beforeEach(() => {
      program = new Command();
      program.exitOverride();
      registerApplyCommand(program);
    });

    it("sets process.exitCode = 2 in --frozen mode with drift", async () => {
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: "manifesthash1234",
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(false);

      await program.parseAsync(["node", "ms", "apply", "--frozen"]);

      expect(process.exitCode).toBe(2);
    });

    it("emits JSON with --json", async () => {
      const hash = "jsonhash00000000";
      mockLocalHash = hash;
      mockManifest = makeManifest({
        "test-skill": {
          source: "owner/repo",
          sourceType: "github",
          computedHash: hash,
          installedAt: new Date().toISOString(),
        },
      });
      setInstalled(true);

      await program.parseAsync(["node", "ms", "apply", "--json"]);

      const jsonCall = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .find((s) => s.includes('"status"'));
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall ?? "{}") as {
        summary: { inSync: number };
      };
      expect(parsed.summary.inSync).toBe(1);
    });
  });
});
