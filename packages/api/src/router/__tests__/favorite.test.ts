import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB client to prevent real SQLite initialization at import time
vi.mock("@curiouslycory/db/client", () => ({
  db: {},
}));

// Mock config-sync to avoid filesystem writes
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
const { createTestCaller } = await import("../../test-utils");

describe("favorite router", () => {
  let caller: Awaited<ReturnType<typeof createTestCaller>>["caller"];
  let rawDb: Database.Database;
  let repoPath: string;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    caller = ctx.caller;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
  });

  beforeEach(() => {
    // Clear favorites between tests
    rawDb.exec("DELETE FROM favorites");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("add", () => {
    it("creates a new favorite with repoUrl", async () => {
      const result = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Test Repo",
      });

      expect(result).toBeDefined();
      expect(result?.repoUrl).toBe("https://github.com/owner/repo");
      expect(result?.name).toBe("Test Repo");
      expect(result?.type).toBe("repo");
    });

    it("returns existing favorite on duplicate", async () => {
      const first = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Test Repo",
      });

      const second = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Test Repo",
      });

      expect(second?.id).toBe(first?.id);
    });

    it("creates skill-level favorite with skillName", async () => {
      const result = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Test Skill",
        skillName: "my-skill",
        type: "skill",
      });

      expect(result?.skillName).toBe("my-skill");
      expect(result?.type).toBe("skill");
    });

    it("handles NULL skillName for repo favorites", async () => {
      const result = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Repo Fav",
      });

      expect(result?.skillName).toBeNull();
    });
  });

  describe("remove", () => {
    it("removes by ID", async () => {
      const added = await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "To Remove",
      });

      expect(added).toBeDefined();
      const result = await caller.favorite.remove({ id: (added as { id: string }).id });
      expect(result).toEqual({ success: true });

      const isFav = await caller.favorite.isFavorited({
        repoUrl: "https://github.com/owner/repo",
      });
      expect(isFav).toBe(false);
    });

    it("handles nonexistent ID", async () => {
      const result = await caller.favorite.remove({ id: "nonexistent-id" });
      expect(result).toEqual({ success: true });
    });
  });

  describe("toggle", () => {
    it("adds when absent", async () => {
      const result = await caller.favorite.toggle({
        repoUrl: "https://github.com/owner/toggle-repo",
        name: "Toggle Repo",
      });

      expect(result).toEqual({ favorited: true });
    });

    it("removes when present", async () => {
      await caller.favorite.add({
        repoUrl: "https://github.com/owner/toggle-repo",
        name: "Toggle Repo",
      });

      const result = await caller.favorite.toggle({
        repoUrl: "https://github.com/owner/toggle-repo",
        name: "Toggle Repo",
      });

      expect(result).toEqual({ favorited: false });
    });

    it("returns { favorited: boolean }", async () => {
      const first = await caller.favorite.toggle({
        repoUrl: "https://github.com/owner/toggle-test",
        name: "Toggle Test",
      });
      expect(typeof first.favorited).toBe("boolean");

      const second = await caller.favorite.toggle({
        repoUrl: "https://github.com/owner/toggle-test",
        name: "Toggle Test",
      });
      expect(typeof second.favorited).toBe("boolean");
      expect(first.favorited).not.toBe(second.favorited);
    });
  });

  describe("isFavorited", () => {
    it("returns true when exists", async () => {
      await caller.favorite.add({
        repoUrl: "https://github.com/owner/fav-check",
        name: "Fav Check",
      });

      const result = await caller.favorite.isFavorited({
        repoUrl: "https://github.com/owner/fav-check",
      });
      expect(result).toBe(true);
    });

    it("returns false when not favorited", async () => {
      const result = await caller.favorite.isFavorited({
        repoUrl: "https://github.com/owner/not-fav",
      });
      expect(result).toBe(false);
    });

    it("distinguishes repo vs skill favorites", async () => {
      await caller.favorite.add({
        repoUrl: "https://github.com/owner/repo",
        name: "Repo Fav",
      });

      // Repo-level is favorited (no skillName)
      const repoFav = await caller.favorite.isFavorited({
        repoUrl: "https://github.com/owner/repo",
      });
      expect(repoFav).toBe(true);

      // Skill-level is NOT favorited
      const skillFav = await caller.favorite.isFavorited({
        repoUrl: "https://github.com/owner/repo",
        skillName: "some-skill",
      });
      expect(skillFav).toBe(false);
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      // Seed multiple favorites
      await caller.favorite.add({
        repoUrl: "https://github.com/alpha/repo",
        name: "Alpha Repo",
      });
      await caller.favorite.add({
        repoUrl: "https://github.com/beta/repo",
        name: "Beta Repo",
        skillName: "beta-skill",
        type: "skill",
      });
      await caller.favorite.add({
        repoUrl: "https://github.com/gamma/repo",
        name: "Gamma Repo",
      });
    });

    it("returns paginated results", async () => {
      const result = await caller.favorite.list({
        page: 1,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(3);
    });

    it("returns second page", async () => {
      const result = await caller.favorite.list({
        page: 2,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(3);
    });

    it("filters by search term matching name", async () => {
      const result = await caller.favorite.list({
        search: "Alpha",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe("Alpha Repo");
    });

    it("filters by search term matching repoUrl", async () => {
      const result = await caller.favorite.list({
        search: "beta/repo",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe("Beta Repo");
    });

    it("filters by type", async () => {
      const repoResult = await caller.favorite.list({ type: "repo" });
      expect(repoResult.items).toHaveLength(2);

      const skillResult = await caller.favorite.list({ type: "skill" });
      expect(skillResult.items).toHaveLength(1);
      expect(skillResult.items[0]?.skillName).toBe("beta-skill");
    });

    it("sorts by name ascending", async () => {
      const result = await caller.favorite.list({
        sortBy: "name",
        sortOrder: "asc",
      });

      const names = result.items.map((i) => i.name);
      expect(names).toEqual(["Alpha Repo", "Beta Repo", "Gamma Repo"]);
    });

    it("sorts by name descending", async () => {
      const result = await caller.favorite.list({
        sortBy: "name",
        sortOrder: "desc",
      });

      const names = result.items.map((i) => i.name);
      expect(names).toEqual(["Gamma Repo", "Beta Repo", "Alpha Repo"]);
    });

    it("defaults to returning all items", async () => {
      const result = await caller.favorite.list();

      expect(result.items).toHaveLength(3);
      expect(result.totalCount).toBe(3);
    });
  });

  describe("stats", () => {
    it("returns correct counts with data", async () => {
      await caller.favorite.add({
        repoUrl: "https://github.com/a/repo",
        name: "A Repo",
      });
      await caller.favorite.add({
        repoUrl: "https://github.com/b/repo",
        name: "B Repo",
      });
      await caller.favorite.add({
        repoUrl: "https://github.com/a/repo",
        name: "A Skill",
        skillName: "skill1",
        type: "skill",
      });

      const stats = await caller.favorite.stats();

      expect(stats.total).toBe(3);
      expect(stats.repoCount).toBe(2);
      expect(stats.skillCount).toBe(1);
      expect(stats.mostRecent).toBeDefined();
      expect(["A Repo", "B Repo", "A Skill"]).toContain(stats.mostRecent?.name);
    });

    it("returns zeros when empty", async () => {
      const stats = await caller.favorite.stats();

      expect(stats.total).toBe(0);
      expect(stats.repoCount).toBe(0);
      expect(stats.skillCount).toBe(0);
      expect(stats.mostRecent).toBeNull();
      expect(stats.topRepos).toHaveLength(0);
    });

    it("returns correct topRepos", async () => {
      await caller.favorite.add({
        repoUrl: "https://github.com/top/repo",
        name: "Top Repo",
        skillName: "skill-a",
        type: "skill",
      });
      await caller.favorite.add({
        repoUrl: "https://github.com/top/repo",
        name: "Top Repo",
        skillName: "skill-b",
        type: "skill",
      });

      const stats = await caller.favorite.stats();

      expect(stats.topRepos).toHaveLength(1);
      expect(stats.topRepos[0]?.repoUrl).toBe("https://github.com/top/repo");
      expect(stats.topRepos[0]?.count).toBe(2);
    });
  });
});
