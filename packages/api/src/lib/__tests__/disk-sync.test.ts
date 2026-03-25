import { mkdir, rm, writeFile } from "node:fs/promises";
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

import type { TestContext } from "../../test-utils";

// Mock the DB client to prevent real SQLite initialization at import time
vi.mock("@curiouslycory/db/client", () => ({
  db: {},
}));

// Mock config-sync to avoid filesystem writes
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

const { createTestCaller } = await import("../../test-utils");

function makeSkillMd(name: string, description: string, body = ""): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

describe("scanAndSync", () => {
  let db: TestContext["db"];
  let rawDb: Database.Database;
  let repoPath: string;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    db = ctx.db;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
  });

  beforeEach(async () => {
    rawDb.exec("DELETE FROM skills");
    // Clean up disk state from prior tests
    await rm(join(repoPath, "skills"), { recursive: true, force: true });
    await rm(join(repoPath, "artifacts"), { recursive: true, force: true });
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function runScanAndSync(repoDir: string) {
    const { scanAndSync } = await import("../disk-sync");
    // Cast db — test drizzle instance lacks $client property present on the real client
    return scanAndSync(repoDir, db as Parameters<typeof scanAndSync>[1]);
  }

  it("adds new skills found on disk to DB", async () => {
    const skillDir = join(repoPath, "skills", "my-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      makeSkillMd("my-skill", "A test skill", "Some body content"),
    );

    const result = await runScanAndSync(repoPath);

    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);

    const rows = rawDb
      .prepare("SELECT name, description, content, category, dir_path FROM skills")
      .all() as { name: string; description: string; content: string; category: string; dir_path: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "my-skill",
      description: "A test skill",
      content: "Some body content",
      category: "skill",
      dir_path: "skills/my-skill",
    });
  });

  it("updates existing skill when content changes", async () => {
    const skillDir = join(repoPath, "skills", "updatable");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      makeSkillMd("updatable", "Original desc", "Original body"),
    );

    // First sync — adds
    await runScanAndSync(repoPath);

    // Change the file
    await writeFile(
      join(skillDir, "SKILL.md"),
      makeSkillMd("updatable", "Updated desc", "Updated body"),
    );

    const result = await runScanAndSync(repoPath);

    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);

    const row = rawDb
      .prepare("SELECT description, content FROM skills WHERE name = 'updatable'")
      .get() as { description: string; content: string };
    expect(row.description).toBe("Updated desc");
    expect(row.content).toBe("Updated body");
  });

  it("removes stale DB entries not on disk", async () => {
    // Insert a skill directly into DB with a dir_path that doesn't exist on disk
    rawDb.exec(`
      INSERT INTO skills (id, name, description, content, dir_path, category, tags)
      VALUES ('stale-id', 'stale-skill', 'desc', 'body', 'skills/gone', 'skill', '[]')
    `);

    const result = await runScanAndSync(repoPath);

    expect(result.removed).toBe(1);

    const row = rawDb
      .prepare("SELECT * FROM skills WHERE id = 'stale-id'")
      .get();
    expect(row).toBeUndefined();
  });

  it("handles invalid frontmatter by skipping the file", async () => {
    const skillDir = join(repoPath, "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "not valid frontmatter at all",
    );

    const result = await runScanAndSync(repoPath);

    // bad-skill skipped, no adds
    expect(result.added).toBe(0);
  });

  it("returns all zero counts with empty skills directory", async () => {
    // Ensure skills dir exists but is empty
    await mkdir(join(repoPath, "skills"), { recursive: true });

    const result = await runScanAndSync(repoPath);

    expect(result).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("returns all zero counts when skills directory does not exist", async () => {
    // Use a path with no skills/ or artifacts/ subdirectories
    const emptyRepo = join(repoPath, "empty-sub");
    await mkdir(emptyRepo, { recursive: true });

    const result = await runScanAndSync(emptyRepo);

    expect(result).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("syncs artifacts from category subdirectories", async () => {
    const agentDir = join(repoPath, "artifacts", "agents", "my-agent");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "SKILL.md"),
      makeSkillMd("my-agent", "An agent artifact"),
    );

    const promptDir = join(repoPath, "artifacts", "prompts", "my-prompt");
    await mkdir(promptDir, { recursive: true });
    await writeFile(
      join(promptDir, "SKILL.md"),
      makeSkillMd("my-prompt", "A prompt artifact"),
    );

    const result = await runScanAndSync(repoPath);

    expect(result.added).toBeGreaterThanOrEqual(2);

    const agent = rawDb
      .prepare("SELECT category, dir_path FROM skills WHERE name = 'my-agent'")
      .get() as { category: string; dir_path: string };
    expect(agent.category).toBe("agent");
    expect(agent.dir_path).toBe("artifacts/agents/my-agent");

    const prompt = rawDb
      .prepare("SELECT category, dir_path FROM skills WHERE name = 'my-prompt'")
      .get() as { category: string; dir_path: string };
    expect(prompt.category).toBe("prompt");
    expect(prompt.dir_path).toBe("artifacts/prompts/my-prompt");
  });

  it("mixed scenario: adds, updates, and removes in one pass", async () => {
    // Pre-existing skill on disk
    const existingDir = join(repoPath, "skills", "existing");
    await mkdir(existingDir, { recursive: true });
    await writeFile(
      join(existingDir, "SKILL.md"),
      makeSkillMd("existing", "First version"),
    );
    await runScanAndSync(repoPath);

    // Now set up mixed scenario:
    // 1. Update existing skill
    await writeFile(
      join(existingDir, "SKILL.md"),
      makeSkillMd("existing", "Second version"),
    );

    // 2. Add a new skill
    const newDir = join(repoPath, "skills", "brand-new");
    await mkdir(newDir, { recursive: true });
    await writeFile(
      join(newDir, "SKILL.md"),
      makeSkillMd("brand-new", "A new skill"),
    );

    // 3. Insert a stale entry that has no disk counterpart
    rawDb.exec(`
      INSERT INTO skills (id, name, description, content, dir_path, category, tags)
      VALUES ('will-remove', 'old-skill', 'desc', 'body', 'skills/deleted', 'skill', '[]')
    `);

    const result = await runScanAndSync(repoPath);

    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.removed).toBe(1);
  });
});
