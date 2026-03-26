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

describe("composition router", () => {
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
    rawDb.exec("DELETE FROM compositions");
    rawDb.exec("DELETE FROM skills");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /** Helper: insert a skill directly and return its id */
  function insertSkill(name: string, content: string): string {
    const id = crypto.randomUUID();
    rawDb.exec(
      `INSERT INTO skills (id, name, description, tags, content, category)
       VALUES ('${id}', '${name}', 'desc', '[]', '${content}', 'skill')`,
    );
    return id;
  }

  describe("create", () => {
    it("creates a composition with name and fragments", async () => {
      const skillId = insertSkill("frag-skill", "fragment content");

      const result = await caller.composition.create({
        name: "My Composition",
        fragments: [skillId],
        order: [skillId],
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("My Composition");
      expect(JSON.parse(result?.fragments ?? "[]")).toEqual([skillId]);
      expect(JSON.parse(result?.order ?? "[]")).toEqual([skillId]);
    });

    it("creates composition with description", async () => {
      const result = await caller.composition.create({
        name: "Described",
        description: "A description",
        fragments: [],
        order: [],
      });

      expect(result?.description).toBe("A description");
    });

    it("creates composition with empty fragments", async () => {
      const result = await caller.composition.create({
        name: "Empty",
        fragments: [],
        order: [],
      });

      expect(result).toBeDefined();
      expect(JSON.parse(result?.fragments ?? "null")).toEqual([]);
    });
  });

  describe("byId", () => {
    it("returns composition with resolved fragments", async () => {
      const id1 = insertSkill("skill-1", "content 1");
      const id2 = insertSkill("skill-2", "content 2");

      const created = await caller.composition.create({
        name: "With Fragments",
        fragments: [id1, id2],
        order: [id1, id2],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.byId({ id: compId });

      expect(result).toBeDefined();
      expect(result?.name).toBe("With Fragments");
      expect(result?.resolvedFragments).toHaveLength(2);
      expect(result?.resolvedFragments[0]?.name).toBe("skill-1");
      expect(result?.resolvedFragments[1]?.name).toBe("skill-2");
    });

    it("preserves fragment order from composition", async () => {
      const id1 = insertSkill("first", "content 1");
      const id2 = insertSkill("second", "content 2");

      const created = await caller.composition.create({
        name: "Ordered",
        fragments: [id2, id1],
        order: [id2, id1],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.byId({ id: compId });

      expect(result?.resolvedFragments[0]?.name).toBe("second");
      expect(result?.resolvedFragments[1]?.name).toBe("first");
    });

    it("returns null for nonexistent composition", async () => {
      const result = await caller.composition.byId({ id: "nonexistent" });
      expect(result).toBeNull();
    });

    it("returns empty resolvedFragments when no fragments", async () => {
      const created = await caller.composition.create({
        name: "No Frags",
        fragments: [],
        order: [],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.byId({ id: compId });

      expect(result?.resolvedFragments).toEqual([]);
    });
  });

  describe("list", () => {
    it("returns all compositions", async () => {
      await caller.composition.create({
        name: "Comp 1",
        fragments: [],
        order: [],
      });
      await caller.composition.create({
        name: "Comp 2",
        fragments: [],
        order: [],
      });

      const result = await caller.composition.list();

      expect(result).toHaveLength(2);
      const names = result.map((r) => r.name);
      expect(names).toContain("Comp 1");
      expect(names).toContain("Comp 2");
    });

    it("returns empty array when no compositions exist", async () => {
      const result = await caller.composition.list();
      expect(result).toEqual([]);
    });

    it("includes outdated flag when fragments are newer", async () => {
      const skillId = insertSkill("evolving", "original");

      const created = await caller.composition.create({
        name: "Will Be Outdated",
        fragments: [skillId],
        order: [skillId],
      });

      // Update the skill's timestamp to be newer than the composition
      rawDb.exec(
        `UPDATE skills SET updated_at = unixepoch() + 10 WHERE id = '${skillId}'`,
      );

      const result = await caller.composition.list();
      const comp = result.find(
        (r) => r.name === (created as { name: string }).name,
      );

      expect(comp?.outdated).toBe(true);
    });

    it("shows not outdated when fragments are older", async () => {
      await caller.composition.create({
        name: "Fresh",
        fragments: [],
        order: [],
      });

      const result = await caller.composition.list();
      const comp = result.find((r) => r.name === "Fresh");

      expect(comp?.outdated).toBe(false);
    });
  });

  describe("update", () => {
    it("updates composition fields", async () => {
      const created = await caller.composition.create({
        name: "Original",
        fragments: [],
        order: [],
      });
      const compId = (created as { id: string }).id;

      const updated = await caller.composition.update({
        id: compId,
        name: "Updated Name",
        description: "New description",
      });

      expect(updated?.name).toBe("Updated Name");
      expect(updated?.description).toBe("New description");
    });

    it("updates fragments and order", async () => {
      const skillId = insertSkill("new-frag", "content");

      const created = await caller.composition.create({
        name: "Update Frags",
        fragments: [],
        order: [],
      });
      const compId = (created as { id: string }).id;

      const updated = await caller.composition.update({
        id: compId,
        fragments: [skillId],
        order: [skillId],
      });

      expect(JSON.parse(updated?.fragments ?? "[]")).toEqual([skillId]);
    });

    it("throws for nonexistent composition", async () => {
      await expect(
        caller.composition.update({ id: "nonexistent", name: "new" }),
      ).rejects.toThrow("Composition not found");
    });
  });

  describe("delete", () => {
    it("removes composition from DB", async () => {
      const created = await caller.composition.create({
        name: "Delete Me",
        fragments: [],
        order: [],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.delete({ id: compId });
      expect(result).toEqual({ success: true });

      const found = await caller.composition.byId({ id: compId });
      expect(found).toBeNull();
    });

    it("throws for nonexistent composition", async () => {
      await expect(
        caller.composition.delete({ id: "nonexistent" }),
      ).rejects.toThrow("Composition not found");
    });
  });

  describe("preview", () => {
    it("returns merged content from fragments", async () => {
      const id1 = insertSkill("prev-1", "# Section A\nContent A");
      const id2 = insertSkill("prev-2", "# Section B\nContent B");

      const result = await caller.composition.preview({
        fragmentIds: [id1, id2],
        order: [id1, id2],
      });

      expect(result).toContain("Section A");
      expect(result).toContain("Content A");
      expect(result).toContain("Section B");
      expect(result).toContain("Content B");
    });

    it("returns empty string for empty fragments", async () => {
      const result = await caller.composition.preview({
        fragmentIds: [],
        order: [],
      });

      expect(result).toBe("");
    });

    it("respects order parameter", async () => {
      const id1 = insertSkill("order-1", "# First\nFirst content");
      const id2 = insertSkill("order-2", "# Second\nSecond content");

      const result = await caller.composition.preview({
        fragmentIds: [id1, id2],
        order: [id2, id1],
      });

      const secondIdx = result.indexOf("Second");
      const firstIdx = result.indexOf("First content");
      expect(secondIdx).toBeLessThan(firstIdx);
    });
  });

  describe("exportMarkdown", () => {
    it("returns merged markdown for composition", async () => {
      const id1 = insertSkill("exp-1", "# Export A\nExport content A");
      const id2 = insertSkill("exp-2", "# Export B\nExport content B");

      const created = await caller.composition.create({
        name: "Export Test",
        fragments: [id1, id2],
        order: [id1, id2],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.exportMarkdown({ id: compId });

      expect(result).toContain("Export A");
      expect(result).toContain("Export content A");
      expect(result).toContain("Export B");
      expect(result).toContain("Export content B");
    });

    it("returns empty string for composition with no fragments", async () => {
      const created = await caller.composition.create({
        name: "Empty Export",
        fragments: [],
        order: [],
      });
      const compId = (created as { id: string }).id;

      const result = await caller.composition.exportMarkdown({ id: compId });

      expect(result).toBe("");
    });

    it("throws for nonexistent composition", async () => {
      await expect(
        caller.composition.exportMarkdown({ id: "nonexistent" }),
      ).rejects.toThrow("Composition not found");
    });
  });
});
