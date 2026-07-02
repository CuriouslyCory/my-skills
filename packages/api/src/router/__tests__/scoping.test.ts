import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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

/**
 * Per-user scoping (#21): two users share one deployment. Every router read must
 * return only the calling user's rows, and no user may read, update, or delete
 * another user's records. Per-user unique constraints allow the same
 * name/key/favorite for different users while rejecting duplicates for one user.
 */
describe("per-user data scoping", () => {
  let rawDb: Database.Database;
  let repoPath: string;
  let userA: ReturnType<
    Awaited<ReturnType<typeof createTestCaller>>["callerFor"]
  >;
  let userB: ReturnType<
    Awaited<ReturnType<typeof createTestCaller>>["callerFor"]
  >;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
    userA = ctx.callerFor({ id: "user-a" });
    userB = ctx.callerFor({ id: "user-b" });
  });

  beforeEach(() => {
    rawDb.exec("DELETE FROM skills");
    rawDb.exec("DELETE FROM favorites");
    rawDb.exec("DELETE FROM compositions");
    rawDb.exec("DELETE FROM config");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("skills", () => {
    it("each user only sees their own skills", async () => {
      await userA.skill.create({
        name: "a-skill",
        description: "A",
        content: "content-a",
      });
      await userB.skill.create({
        name: "b-skill",
        description: "B",
        content: "content-b",
      });

      const aList = await userA.skill.list();
      const bList = await userB.skill.list();

      expect(aList.map((s) => s.name)).toEqual(["a-skill"]);
      expect(bList.map((s) => s.name)).toEqual(["b-skill"]);
    });

    it("allows the same skill name for different users (per-user unique)", async () => {
      const a = await userA.skill.create({
        name: "shared-name",
        description: "A",
        content: "a",
      });
      const b = await userB.skill.create({
        name: "shared-name",
        description: "B",
        content: "b",
      });

      expect(a?.name).toBe("shared-name");
      expect(b?.name).toBe("shared-name");
      expect(a?.id).not.toBe(b?.id);
    });

    it("rejects a duplicate skill name for the same user", async () => {
      await userA.skill.create({
        name: "dup",
        description: "first",
        content: "x",
      });

      await expect(
        userA.skill.create({ name: "dup", description: "second", content: "y" }),
      ).rejects.toThrow();
    });

    it("cannot read another user's skill by id", async () => {
      const b = await userB.skill.create({
        name: "b-only",
        description: "B",
        content: "secret",
      });
      const bId = (b as { id: string }).id;

      expect(await userA.skill.byId({ id: bId })).toBeNull();
      // Owner can still read it.
      expect((await userB.skill.byId({ id: bId }))?.name).toBe("b-only");
    });

    it("cannot update or delete another user's skill", async () => {
      const b = await userB.skill.create({
        name: "b-guarded",
        description: "B",
        content: "content",
      });
      const bId = (b as { id: string }).id;

      await expect(
        userA.skill.update({ id: bId, description: "hacked" }),
      ).rejects.toThrow("Skill not found");
      await expect(userA.skill.delete({ id: bId })).rejects.toThrow(
        "Skill not found",
      );

      // Untouched for the owner.
      expect((await userB.skill.byId({ id: bId }))?.description).toBe("B");
    });
  });

  describe("favorites", () => {
    it("scopes favorites and stats per user", async () => {
      await userA.favorite.add({
        repoUrl: "https://github.com/shared/repo",
        name: "A Fav",
      });
      await userB.favorite.add({
        repoUrl: "https://github.com/shared/repo",
        name: "B Fav",
      });

      const aList = await userA.favorite.list();
      const bList = await userB.favorite.list();

      expect(aList.items.map((f) => f.name)).toEqual(["A Fav"]);
      expect(bList.items.map((f) => f.name)).toEqual(["B Fav"]);

      expect((await userA.favorite.stats()).total).toBe(1);
      expect((await userB.favorite.stats()).total).toBe(1);

      // isFavorited is per user.
      expect(
        await userA.favorite.isFavorited({
          repoUrl: "https://github.com/shared/repo",
        }),
      ).toBe(true);
    });

    it("cannot remove another user's favorite", async () => {
      const b = await userB.favorite.add({
        repoUrl: "https://github.com/b/repo",
        name: "B Fav",
      });
      const bId = (b as { id: string }).id;

      await userA.favorite.remove({ id: bId });

      // B's favorite survives A's scoped delete.
      const bList = await userB.favorite.list();
      expect(bList.items.map((f) => f.id)).toContain(bId);
    });
  });

  describe("compositions", () => {
    it("scopes list and blocks cross-user access", async () => {
      await userA.composition.create({
        name: "A Comp",
        fragments: [],
        order: [],
      });
      const b = await userB.composition.create({
        name: "B Comp",
        fragments: [],
        order: [],
      });
      const bId = (b as { id: string }).id;

      expect((await userA.composition.list()).map((c) => c.name)).toEqual([
        "A Comp",
      ]);
      expect(await userA.composition.byId({ id: bId })).toBeNull();
      await expect(
        userA.composition.update({ id: bId, name: "hacked" }),
      ).rejects.toThrow("Composition not found");
      await expect(userA.composition.delete({ id: bId })).rejects.toThrow(
        "Composition not found",
      );
    });
  });

  describe("config", () => {
    it("keeps per-user preferences isolated", async () => {
      await userA.config.set({ key: "theme", value: "dark" });
      await userB.config.set({ key: "theme", value: "light" });

      expect((await userA.config.get({ key: "theme" }))?.value).toBe("dark");
      expect((await userB.config.get({ key: "theme" }))?.value).toBe("light");

      expect(await userA.config.getAll()).toHaveLength(1);
      expect((await userA.config.getAll())[0]?.value).toBe("dark");
    });
  });

  describe("search", () => {
    it("only returns the calling user's skills", async () => {
      await userA.skill.create({
        name: "alpha-widget",
        description: "widget for alpha",
        content: "alpha content",
      });
      await userB.skill.create({
        name: "beta-widget",
        description: "widget for beta",
        content: "beta content",
      });

      const aHits = await userA.search.query({ query: "widget" });
      const bHits = await userB.search.query({ query: "widget" });

      expect(aHits.map((h) => h.name)).toEqual(["alpha-widget"]);
      expect(bHits.map((h) => h.name)).toEqual(["beta-widget"]);

      // Empty-query (recent) path is scoped too.
      const aRecent = await userA.search.query({});
      expect(aRecent.map((h) => h.name)).toEqual(["alpha-widget"]);
    });
  });

  describe("local mode mapping", () => {
    it("maps records to the auto-provisioned local user id", async () => {
      const ctx = await createTestCaller();
      try {
        const localId = "local-user-id";
        const local = ctx.callerFor({
          id: localId,
          email: "local@my-skills.local",
        });

        const created = await local.skill.create({
          name: "local-skill",
          description: "local",
          content: "local content",
        });
        expect(created?.userId).toBe(localId);

        const rows = await local.skill.list();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.userId).toBe(localId);
      } finally {
        ctx.rawDb.close();
        await rm(ctx.repoPath, { recursive: true, force: true });
      }
    });
  });
});
