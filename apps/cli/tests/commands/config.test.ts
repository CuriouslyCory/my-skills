import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerConfigCommand } from "../../src/commands/config.js";
import { saveConfig } from "../../src/core/config.js";

let mockConfig: Config;

const DEFAULT_CONFIG: Config = {
  defaultAgents: [],
  favoriteRepos: [],
  cacheDir: "/tmp/cache",
  skillsDir: ".agents/skills",
  autoDetectAgents: true,
  symlinkBehavior: "copy",
};

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() => Promise.resolve(mockConfig)),
  saveConfig: vi.fn(() => Promise.resolve(undefined)),
  DEFAULT_CONFIG: {
    defaultAgents: [],
    favoriteRepos: [],
    cacheDir: "/tmp/cache",
    skillsDir: ".agents/skills",
    autoDetectAgents: true,
    symlinkBehavior: "copy",
  },
}));

describe("config command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerConfigCommand(program);

    mockConfig = { ...DEFAULT_CONFIG };

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("config get", () => {
    it("prints value for known key", async () => {
      mockConfig.skillsDir = ".agents/skills";

      await program.parseAsync(["node", "ms", "config", "get", "skillsDir"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(".agents/skills"),
      );
    });

    it("prints error for unknown key", async () => {
      await program.parseAsync(["node", "ms", "config", "get", "nonexistent"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config key"),
      );
    });

    it("supports dot-notation for nested access", async () => {
      mockConfig.defaultAgents = ["claude-code" as const];

      await program.parseAsync([
        "node",
        "ms",
        "config",
        "get",
        "defaultAgents.0",
      ]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("claude-code"),
      );
    });
  });

  describe("config set", () => {
    it("sets a string value and saves", async () => {
      await program.parseAsync([
        "node",
        "ms",
        "config",
        "set",
        "skillsDir",
        ".custom/skills",
      ]);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ skillsDir: ".custom/skills" }),
      );
    });

    it("rejects unknown key with error", async () => {
      await program.parseAsync([
        "node",
        "ms",
        "config",
        "set",
        "badKey",
        "value",
      ]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config key"),
      );
      expect(saveConfig).not.toHaveBeenCalled();
    });
  });

  describe("config list", () => {
    it("prints all config keys and values", async () => {
      await program.parseAsync(["node", "ms", "config", "list"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("skillsDir"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("autoDetectAgents"),
      );
    });
  });

  describe("config delete", () => {
    it("resets key to default value", async () => {
      mockConfig.skillsDir = ".custom/skills";

      await program.parseAsync(["node", "ms", "config", "delete", "skillsDir"]);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ skillsDir: ".agents/skills" }),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("reset to default"),
      );
    });

    it("rejects unknown key", async () => {
      await program.parseAsync(["node", "ms", "config", "delete", "badKey"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config key"),
      );
      expect(saveConfig).not.toHaveBeenCalled();
    });
  });
});
