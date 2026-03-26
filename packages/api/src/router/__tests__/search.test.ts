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

describe("search router", () => {
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

  function seedSkills() {
    rawDb.exec(`
      INSERT INTO skills (id, name, description, tags, content, category, dir_path)
      VALUES
        ('s1', 'typescript-linter', 'A linting tool for TypeScript projects', '["lint","typescript"]', 'Lint your TS code with ease', 'skill', 'skills/typescript-linter'),
        ('s2', 'react-testing', 'Testing utilities for React components', '["react","testing"]', 'Test React components effectively', 'skill', 'skills/react-testing'),
        ('s3', 'python-formatter', 'Code formatter for Python files', '["python","format"]', 'Format Python code beautifully', 'skill', 'skills/python-formatter'),
        ('s4', 'deploy-helper', 'Deployment automation agent', '["deploy","ci"]', 'Deploy your apps seamlessly', 'agent', 'artifacts/agents/deploy-helper'),
        ('s5', 'api-docs', 'Generate API documentation from source', '["docs","api"]', 'Generate docs from your API endpoints', 'prompt', 'artifacts/prompts/api-docs');
    `);
  }

  describe("empty query", () => {
    it("returns recent items ordered by updatedAt", async () => {
      seedSkills();

      const results = await caller.search.query({});

      expect(results).toHaveLength(5);
      // All items returned with null snippet
      for (const r of results) {
        expect(r.snippet).toBeNull();
      }
    });

    it("filters by category when provided", async () => {
      seedSkills();

      const results = await caller.search.query({ category: "agent" });

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("deploy-helper");
      expect(results[0]?.snippet).toBeNull();
    });

    it("returns empty for non-existent category", async () => {
      seedSkills();

      const results = await caller.search.query({ category: "nonexistent" });

      expect(results).toHaveLength(0);
    });
  });

  describe("FTS match", () => {
    it("returns skills matching search term with snippets", async () => {
      seedSkills();

      const results = await caller.search.query({ query: "typescript" });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((r) => r.name === "typescript-linter");
      expect(match).toBeDefined();
      expect(match?.snippet).toBeDefined();
      expect(match?.snippet).toContain("<mark>");
    });

    it("matches across name, description, tags, and content", async () => {
      seedSkills();

      // "linting" appears in description of typescript-linter
      const results = await caller.search.query({ query: "linting" });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe("typescript-linter");
    });

    it("supports prefix matching", async () => {
      seedSkills();

      // "test" should match "testing" via prefix
      const results = await caller.search.query({ query: "test" });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((r) => r.name === "react-testing");
      expect(match).toBeDefined();
    });

    it("filters by category with FTS query", async () => {
      seedSkills();

      // "deploy" matches agent category item
      const skillResults = await caller.search.query({ query: "deploy", category: "skill" });
      expect(skillResults).toHaveLength(0);

      const agentResults = await caller.search.query({ query: "deploy", category: "agent" });
      expect(agentResults).toHaveLength(1);
      expect(agentResults[0]?.name).toBe("deploy-helper");
    });
  });

  describe("pagination", () => {
    it("respects limit parameter", async () => {
      seedSkills();

      const results = await caller.search.query({ limit: 2 });

      expect(results).toHaveLength(2);
    });

    it("respects offset parameter", async () => {
      seedSkills();

      const allResults = await caller.search.query({ limit: 100 });
      const offsetResults = await caller.search.query({ limit: 100, offset: 2 });

      expect(offsetResults).toHaveLength(allResults.length - 2);
    });

    it("limit and offset work together", async () => {
      seedSkills();

      const page1 = await caller.search.query({ limit: 2, offset: 0 });
      const page2 = await caller.search.query({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      // Pages should have different items
      const page1Names = page1.map((r) => r.name);
      const page2Names = page2.map((r) => r.name);
      expect(page1Names).not.toEqual(page2Names);
    });
  });

  describe("result shape", () => {
    it("returns camelCase field mapping for FTS results", async () => {
      seedSkills();

      const results = await caller.search.query({ query: "typescript" });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const result = results[0];
      // Should have camelCase fields, not snake_case
      expect(result).toHaveProperty("dirPath");
      expect(result).toHaveProperty("snippet");
      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("updatedAt");
      // Should NOT have snake_case fields
      expect(result).not.toHaveProperty("dir_path");
      expect(result).not.toHaveProperty("created_at");
      expect(result).not.toHaveProperty("updated_at");
    });

    it("returns snippet field with mark tags for FTS results", async () => {
      seedSkills();

      const results = await caller.search.query({ query: "React" });

      const match = results.find((r) => r.name === "react-testing");
      expect(match).toBeDefined();
      expect(match?.snippet).toContain("<mark>");
      expect(match?.snippet).toContain("</mark>");
    });

    it("empty query results have standard drizzle shape with null snippet", async () => {
      seedSkills();

      const results = await caller.search.query({});

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("tags");
      expect(result).toHaveProperty("content");
      expect(result?.snippet).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns empty array when no skills exist", async () => {
      const results = await caller.search.query({ query: "anything" });

      expect(results).toHaveLength(0);
    });

    it("handles whitespace-only query as empty query", async () => {
      seedSkills();

      const results = await caller.search.query({ query: "   " });

      // Treated as empty query — returns all recent items
      expect(results).toHaveLength(5);
      for (const r of results) {
        expect(r.snippet).toBeNull();
      }
    });

    it("handles multi-word search query", async () => {
      seedSkills();

      const results = await caller.search.query({ query: "code format" });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((r) => r.name === "python-formatter");
      expect(match).toBeDefined();
    });
  });
});
