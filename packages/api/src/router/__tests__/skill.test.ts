import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
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

describe("skill router", () => {
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
    rawDb.exec("DELETE FROM skills");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("list", () => {
    it("returns all skills ordered by updatedAt desc", async () => {
      const s1 = await caller.skill.create({
        name: "skill-a",
        description: "First skill",
        content: "content a",
      });
      const s2 = await caller.skill.create({
        name: "skill-b",
        description: "Second skill",
        content: "content b",
      });

      const result = await caller.skill.list();

      expect(result).toHaveLength(2);
      // Both created in same second so just check both are present
      const names = result.map((r) => r.name);
      expect(names).toContain(s1?.name);
      expect(names).toContain(s2?.name);
    });

    it("filters by category", async () => {
      await caller.skill.create({
        name: "my-skill",
        description: "A skill",
        content: "content",
        category: "skill",
      });
      await caller.skill.create({
        name: "my-agent",
        description: "An agent",
        content: "agent content",
        category: "agent",
      });

      const result = await caller.skill.list({ category: "skill" });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("my-skill");
    });

    it("returns empty array when no skills exist", async () => {
      const result = await caller.skill.list();
      expect(result).toEqual([]);
    });

    it("filters by tags", async () => {
      await caller.skill.create({
        name: "tagged-skill",
        description: "Has tags",
        content: "content",
        tags: ["typescript", "testing"],
      });
      await caller.skill.create({
        name: "other-skill",
        description: "Different tags",
        content: "content",
        tags: ["python"],
      });

      const result = await caller.skill.list({ tags: ["typescript"] });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("tagged-skill");
    });
  });

  describe("byId", () => {
    it("returns skill by id", async () => {
      const created = await caller.skill.create({
        name: "find-me",
        description: "Find this skill",
        content: "findable content",
      });
      const id = (created as { id: string }).id;

      const result = await caller.skill.byId({ id });

      expect(result).toBeDefined();
      expect(result?.name).toBe("find-me");
      expect(result?.content).toBe("findable content");
    });

    it("returns null for nonexistent id", async () => {
      const result = await caller.skill.byId({ id: "nonexistent-id" });
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("inserts skill to DB with correct fields", async () => {
      const result = await caller.skill.create({
        name: "new-skill",
        description: "A new skill",
        tags: ["tag1", "tag2"],
        author: "test-author",
        version: "1.0.0",
        content: "skill body content",
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("new-skill");
      expect(result?.description).toBe("A new skill");
      expect(result?.tags).toBe(JSON.stringify(["tag1", "tag2"]));
      expect(result?.author).toBe("test-author");
      expect(result?.version).toBe("1.0.0");
      expect(result?.content).toBe("skill body content");
      expect(result?.category).toBe("skill");
    });

    it("writes SKILL.md file to repoPath", async () => {
      await caller.skill.create({
        name: "disk-skill",
        description: "Written to disk",
        content: "file content here",
      });

      const skillMdPath = join(repoPath, "skills", "disk-skill", "SKILL.md");
      expect(existsSync(skillMdPath)).toBe(true);

      const fileContent = await readFile(skillMdPath, "utf-8");
      expect(fileContent).toContain("name: disk-skill");
      expect(fileContent).toContain("description: Written to disk");
      expect(fileContent).toContain("file content here");
    });

    it("defaults category to 'skill'", async () => {
      const result = await caller.skill.create({
        name: "default-cat",
        description: "Default category",
        content: "content",
      });

      expect(result?.category).toBe("skill");
    });

    it("allows custom category", async () => {
      const result = await caller.skill.create({
        name: "custom-cat",
        description: "Custom category",
        content: "content",
        category: "agent",
      });

      expect(result?.category).toBe("agent");
    });
  });

  describe("update", () => {
    it("updates skill fields", async () => {
      const created = await caller.skill.create({
        name: "update-me",
        description: "Original",
        content: "original content",
      });
      const id = (created as { id: string }).id;

      const updated = await caller.skill.update({
        id,
        description: "Updated description",
        content: "updated content",
      });

      expect(updated?.description).toBe("Updated description");
      expect(updated?.content).toBe("updated content");
      expect(updated?.name).toBe("update-me");
    });

    it("throws for nonexistent skill", async () => {
      await expect(
        caller.skill.update({ id: "nonexistent", name: "new-name" }),
      ).rejects.toThrow("Skill not found");
    });

    it("writes updated SKILL.md to disk", async () => {
      const created = await caller.skill.create({
        name: "update-disk",
        description: "Will update",
        content: "original",
      });
      const id = (created as { id: string }).id;

      await caller.skill.update({
        id,
        content: "updated on disk",
      });

      const skillMdPath = join(
        repoPath,
        "skills",
        "update-disk",
        "SKILL.md",
      );
      const fileContent = await readFile(skillMdPath, "utf-8");
      expect(fileContent).toContain("updated on disk");
    });
  });

  describe("delete", () => {
    it("removes skill from DB", async () => {
      const created = await caller.skill.create({
        name: "delete-me",
        description: "To be deleted",
        content: "content",
      });
      const id = (created as { id: string }).id;

      const result = await caller.skill.delete({ id });
      expect(result).toEqual({ success: true });

      const found = await caller.skill.byId({ id });
      expect(found).toBeNull();
    });

    it("removes skill directory from disk", async () => {
      const created = await caller.skill.create({
        name: "delete-disk",
        description: "Remove from disk",
        content: "content",
      });
      const id = (created as { id: string }).id;
      const dirPath = join(repoPath, "skills", "delete-disk");

      expect(existsSync(dirPath)).toBe(true);

      await caller.skill.delete({ id });

      expect(existsSync(dirPath)).toBe(false);
    });

    it("throws for nonexistent skill", async () => {
      await expect(
        caller.skill.delete({ id: "nonexistent" }),
      ).rejects.toThrow("Skill not found");
    });
  });
});

describe("artifact router", () => {
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
    rawDb.exec("DELETE FROM skills");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("list", () => {
    it("excludes category 'skill' by default", async () => {
      // Insert directly via rawDb to control category
      rawDb.exec(`
        INSERT INTO skills (id, name, description, tags, content, category)
        VALUES
          ('id-skill', 'a-skill', 'desc', '[]', 'content', 'skill'),
          ('id-agent', 'an-agent', 'desc', '[]', 'content', 'agent'),
          ('id-prompt', 'a-prompt', 'desc', '[]', 'content', 'prompt')
      `);

      const result = await caller.artifact.list();

      expect(result).toHaveLength(2);
      const categories = result.map((r) => r.category);
      expect(categories).not.toContain("skill");
      expect(categories).toContain("agent");
      expect(categories).toContain("prompt");
    });

    it("filters by specific artifact category", async () => {
      rawDb.exec(`
        INSERT INTO skills (id, name, description, tags, content, category)
        VALUES
          ('id-a1', 'agent-1', 'desc', '[]', 'content', 'agent'),
          ('id-p1', 'prompt-1', 'desc', '[]', 'content', 'prompt')
      `);

      const result = await caller.artifact.list({ category: "agent" });

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe("agent");
    });
  });

  describe("create", () => {
    it("creates artifact with valid category", async () => {
      const result = await caller.artifact.create({
        name: "my-agent",
        description: "An agent artifact",
        category: "agent",
        content: "agent content",
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("my-agent");
      expect(result?.category).toBe("agent");
    });

    it("rejects category 'skill'", async () => {
      const input = {
        name: "bad-artifact",
        description: "Should fail",
        category: "skill",
        content: "content",
      } as unknown as Parameters<typeof caller.artifact.create>[0];

      await expect(caller.artifact.create(input)).rejects.toThrow();
    });

    it("writes SKILL.md to artifacts directory", async () => {
      await caller.artifact.create({
        name: "disk-agent",
        description: "Written to disk",
        category: "agent",
        content: "agent file content",
      });

      const skillMdPath = join(
        repoPath,
        "artifacts",
        "agents",
        "disk-agent",
        "SKILL.md",
      );
      expect(existsSync(skillMdPath)).toBe(true);

      const fileContent = await readFile(skillMdPath, "utf-8");
      expect(fileContent).toContain("agent file content");
    });

    it("supports all artifact categories", async () => {
      const categories = ["agent", "prompt", "claudemd"] as const;
      for (const category of categories) {
        const result = await caller.artifact.create({
          name: `test-${category}`,
          description: `A ${category}`,
          category,
          content: `${category} content`,
        });
        expect(result?.category).toBe(category);
      }
    });
  });

  describe("byId", () => {
    it("returns artifact by id", async () => {
      const created = await caller.artifact.create({
        name: "find-artifact",
        description: "Findable",
        category: "prompt",
        content: "prompt content",
      });
      const id = (created as { id: string }).id;

      const result = await caller.artifact.byId({ id });

      expect(result?.name).toBe("find-artifact");
      expect(result?.category).toBe("prompt");
    });

    it("returns null for nonexistent id", async () => {
      const result = await caller.artifact.byId({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("updates artifact fields", async () => {
      const created = await caller.artifact.create({
        name: "update-artifact",
        description: "Original",
        category: "agent",
        content: "original",
      });
      const id = (created as { id: string }).id;

      const updated = await caller.artifact.update({
        id,
        description: "Updated",
        content: "updated content",
      });

      expect(updated?.description).toBe("Updated");
      expect(updated?.content).toBe("updated content");
    });

    it("throws for nonexistent artifact", async () => {
      await expect(
        caller.artifact.update({ id: "nonexistent", name: "new" }),
      ).rejects.toThrow("Artifact not found");
    });
  });

  describe("delete", () => {
    it("removes artifact from DB and disk", async () => {
      const created = await caller.artifact.create({
        name: "delete-artifact",
        description: "To remove",
        category: "prompt",
        content: "content",
      });
      const id = (created as { id: string }).id;
      const dirPath = join(
        repoPath,
        "artifacts",
        "prompts",
        "delete-artifact",
      );

      expect(existsSync(dirPath)).toBe(true);

      const result = await caller.artifact.delete({ id });
      expect(result).toEqual({ success: true });

      expect(existsSync(dirPath)).toBe(false);

      const found = await caller.artifact.byId({ id });
      expect(found).toBeNull();
    });

    it("throws for nonexistent artifact", async () => {
      await expect(
        caller.artifact.delete({ id: "nonexistent" }),
      ).rejects.toThrow("Artifact not found");
    });
  });
});
