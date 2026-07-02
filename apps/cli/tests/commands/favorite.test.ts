import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerFavoriteCommand } from "../../src/commands/favorite.js";
import type { ApiClient } from "../../src/core/api-client.js";
import { saveConfig } from "../../src/core/config.js";
import type {
  AccountFavorite,
  FavoritesContext,
} from "../../src/core/favorites.js";

const {
  mockResolveContext,
  mockFetchAll,
  mockHasMerged,
  mockMarkMerged,
  mockConfirm,
  mockIsFavorited,
  mockAdd,
  mockRemove,
} = vi.hoisted(() => ({
  mockResolveContext: vi.fn(),
  mockFetchAll: vi.fn(),
  mockHasMerged: vi.fn(),
  mockMarkMerged: vi.fn(),
  mockConfirm: vi.fn(),
  mockIsFavorited: vi.fn(),
  mockAdd: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(() => Promise.resolve(undefined)),
}));

// Keep the pure helpers real; stub only the auth/IO surface.
vi.mock("../../src/core/favorites.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../../src/core/favorites.js")>();
  return {
    ...actual,
    resolveFavoritesContext: mockResolveContext,
    fetchAllAccountFavorites: mockFetchAll,
    hasMergedFavorites: mockHasMerged,
    markFavoritesMerged: mockMarkMerged,
  };
});

vi.mock("@inquirer/confirm", () => ({ default: mockConfirm }));

const SERVER_URL = "https://my-skills.dev";

function baseConfig(favoriteRepos: string[] = []): Config {
  return {
    defaultAgents: [],
    favoriteRepos,
    cacheDir: "/tmp/cache",
    skillsDir: ".agents/skills",
    autoDetectAgents: true,
    symlinkBehavior: "copy",
    serverUrl: SERVER_URL,
  };
}

function stubClient(): ApiClient {
  return {
    favorite: {
      isFavorited: { query: mockIsFavorited },
      add: { mutate: mockAdd },
      remove: { mutate: mockRemove },
    },
  } as unknown as ApiClient;
}

function authedContext(favoriteRepos: string[] = []): FavoritesContext {
  return {
    authed: true,
    config: baseConfig(favoriteRepos),
    credentials: { serverUrl: SERVER_URL, token: "tok", username: "alice" },
    serverUrl: SERVER_URL,
    client: stubClient(),
  };
}

function localContext(config: Config): FavoritesContext {
  return {
    authed: false,
    config,
    credentials: null,
    serverUrl: SERVER_URL,
    client: null,
  };
}

function makeFavorite(over: Partial<AccountFavorite>): AccountFavorite {
  return {
    id: "fav-id",
    userId: "user-1",
    repoUrl: "https://github.com/owner/repo.git",
    name: "owner/repo",
    description: null,
    skillName: null,
    type: "repo",
    addedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...over,
  } as AccountFavorite;
}

function run(args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerFavoriteCommand(program);
  return program.parseAsync(["node", "ms", ...args]);
}

describe("favorite command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: merge already handled so it doesn't interfere unless a test opts in.
    mockHasMerged.mockResolvedValue(true);
    mockMarkMerged.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  describe("unauthenticated (local config)", () => {
    it("adds repo URL to config.favoriteRepos", async () => {
      const config = baseConfig();
      mockResolveContext.mockResolvedValue(localContext(config));

      await run(["favorite", "add", "owner/repo"]);

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
      const config = baseConfig(["https://github.com/owner/repo.git"]);
      mockResolveContext.mockResolvedValue(localContext(config));

      await run(["favorite", "add", "owner/repo"]);

      expect(saveConfig).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Already favorited"),
      );
    });

    it("removes repo URL from config.favoriteRepos", async () => {
      const config = baseConfig(["https://github.com/owner/repo.git"]);
      mockResolveContext.mockResolvedValue(localContext(config));

      await run(["favorite", "remove", "owner/repo"]);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ favoriteRepos: [] }),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Removed"),
      );
    });

    it("warns when repo is not in favorites", async () => {
      const config = baseConfig();
      mockResolveContext.mockResolvedValue(localContext(config));

      await run(["favorite", "remove", "owner/repo"]);

      expect(saveConfig).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Not in favorites"),
      );
    });

    it("lists local favorites with a star prefix", async () => {
      const config = baseConfig([
        "https://github.com/owner/repo1.git",
        "https://github.com/owner/repo2.git",
      ]);
      mockResolveContext.mockResolvedValue(localContext(config));

      await run(["favorite", "list"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("owner/repo1"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("owner/repo2"),
      );
    });

    it("prints empty message when no local favorites", async () => {
      mockResolveContext.mockResolvedValue(localContext(baseConfig()));

      await run(["favorite", "list"]);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No favorite repos"),
      );
    });

    it("never touches the API when unauthenticated", async () => {
      mockResolveContext.mockResolvedValue(localContext(baseConfig()));

      await run(["favorite", "add", "owner/repo"]);

      expect(mockAdd).not.toHaveBeenCalled();
      expect(mockFetchAll).not.toHaveBeenCalled();
    });
  });

  describe("authenticated (account favorites)", () => {
    it("adds via the favorite router when not already favorited", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockIsFavorited.mockResolvedValue(false);
      mockAdd.mockResolvedValue(makeFavorite({}));

      await run(["favorite", "add", "owner/repo"]);

      expect(mockAdd).toHaveBeenCalledWith({
        repoUrl: "https://github.com/owner/repo.git",
        name: "owner/repo",
        type: "repo",
      });
      expect(saveConfig).not.toHaveBeenCalled();
    });

    it("does not re-add an existing account favorite", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockIsFavorited.mockResolvedValue(true);

      await run(["favorite", "add", "owner/repo"]);

      expect(mockAdd).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Already favorited"),
      );
    });

    it("removes an account favorite by id", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockFetchAll.mockResolvedValue([
        makeFavorite({ id: "row-1", repoUrl: "https://github.com/owner/repo.git" }),
      ]);
      mockRemove.mockResolvedValue({ success: true });

      await run(["favorite", "remove", "owner/repo"]);

      expect(mockRemove).toHaveBeenCalledWith({ id: "row-1" });
    });

    it("warns when the account favorite to remove is missing", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockFetchAll.mockResolvedValue([]);

      await run(["favorite", "remove", "owner/repo"]);

      expect(mockRemove).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Not in favorites"),
      );
    });

    it("lists richer account fields (name, type, addedAt)", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockFetchAll.mockResolvedValue([
        makeFavorite({
          name: "owner/repo",
          type: "repo",
          addedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      ]);

      await run(["favorite", "list"]);

      const output = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(output).toContain("owner/repo");
      expect(output).toContain("[repo]");
      expect(output).toContain("2026-01-02");
      expect(output).toContain(SERVER_URL);
    });

    it("surfaces a clear offline error and exits non-zero", async () => {
      mockResolveContext.mockResolvedValue(authedContext());
      mockFetchAll.mockRejectedValue(
        Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      );

      await run(["favorite", "list"]);

      expect(process.exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Could not reach the server"),
      );
    });
  });

  describe("one-time local -> account merge", () => {
    it("prompts once and merges local favorites on accept", async () => {
      mockResolveContext.mockResolvedValue(
        authedContext(["https://github.com/a/b.git"]),
      );
      mockHasMerged.mockResolvedValue(false);
      mockConfirm.mockResolvedValue(true);
      mockFetchAll.mockResolvedValue([]);

      await run(["favorite", "list"]);

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockAdd).toHaveBeenCalledWith({
        repoUrl: "https://github.com/a/b.git",
        name: "a/b",
        type: "repo",
      });
      expect(mockMarkMerged).toHaveBeenCalledWith(SERVER_URL);
    });

    it("does not merge on decline but records the offer as handled", async () => {
      mockResolveContext.mockResolvedValue(
        authedContext(["https://github.com/a/b.git"]),
      );
      mockHasMerged.mockResolvedValue(false);
      mockConfirm.mockResolvedValue(false);
      mockFetchAll.mockResolvedValue([]);

      await run(["favorite", "list"]);

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockAdd).not.toHaveBeenCalled();
      expect(mockMarkMerged).toHaveBeenCalledWith(SERVER_URL);
    });

    it("--yes skips the merge prompt", async () => {
      mockResolveContext.mockResolvedValue(
        authedContext(["https://github.com/a/b.git"]),
      );
      mockHasMerged.mockResolvedValue(false);
      mockFetchAll.mockResolvedValue([]);

      await run(["favorite", "list", "--yes"]);

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockAdd).not.toHaveBeenCalled();
      expect(mockMarkMerged).toHaveBeenCalledWith(SERVER_URL);
    });

    it("does not prompt again once merge has been handled", async () => {
      mockResolveContext.mockResolvedValue(
        authedContext(["https://github.com/a/b.git"]),
      );
      mockHasMerged.mockResolvedValue(true);
      mockFetchAll.mockResolvedValue([]);

      await run(["favorite", "list"]);

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockMarkMerged).not.toHaveBeenCalled();
    });
  });
});
