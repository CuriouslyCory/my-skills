import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerFavoriteCommand } from "../../src/commands/favorite.js";
import { saveConfig } from "../../src/core/config.js";

let mockConfig: Config;

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() => Promise.resolve(mockConfig)),
  saveConfig: vi.fn(() => Promise.resolve(undefined)),
}));

describe("favorite command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerFavoriteCommand(program);

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("favorite add", () => {
    it("adds repo URL to config.favoriteRepos", async () => {
      await program.parseAsync(["node", "ms", "favorite", "add", "owner/repo"]);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteRepos: ["https://github.com/owner/repo.git"],
        }),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("owner/repo"),
      );
    });

    it("warns when repo is already favorited", async () => {
      mockConfig.favoriteRepos = ["https://github.com/owner/repo.git"];

      await program.parseAsync(["node", "ms", "favorite", "add", "owner/repo"]);

      expect(saveConfig).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Already favorited"),
      );
    });
  });

  describe("favorite remove", () => {
    it("removes repo URL from config.favoriteRepos", async () => {
      mockConfig.favoriteRepos = ["https://github.com/owner/repo.git"];

      await program.parseAsync([
        "node",
        "ms",
        "favorite",
        "remove",
        "owner/repo",
      ]);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteRepos: [],
        }),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Removed"),
      );
    });

    it("warns when repo is not in favorites", async () => {
      await program.parseAsync([
        "node",
        "ms",
        "favorite",
        "remove",
        "owner/repo",
      ]);

      expect(saveConfig).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Not in favorites"),
      );
    });
  });

  describe("favorite list", () => {
    it("prints all favorites with star prefix", async () => {
      mockConfig.favoriteRepos = [
        "https://github.com/owner/repo1.git",
        "https://github.com/owner/repo2.git",
      ];

      await program.parseAsync(["node", "ms", "favorite", "list"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("owner/repo1"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("owner/repo2"),
      );
    });

    it("prints empty message when no favorites", async () => {
      await program.parseAsync(["node", "ms", "favorite", "list"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No favorite repos"),
      );
    });
  });
});
