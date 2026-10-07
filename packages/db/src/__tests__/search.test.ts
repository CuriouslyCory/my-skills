import type { SQL } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { initFTS } from "../fts";
import * as sqliteSchema from "../schema.sqlite";
import { searchSkills } from "../search";
import type { Database as AppDatabase } from "../types";

/** Builds an in-memory SQLite drizzle client with FTS + seed rows. */
function makeSqliteDb() {
  const raw = new Database(":memory:");
  raw.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'test-user',
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      version TEXT,
      content TEXT NOT NULL,
      dir_path TEXT,
      category TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, name),
      UNIQUE(user_id, dir_path)
    );
  `);
  initFTS(raw);
  raw.exec(`
    INSERT INTO skills (id, name, description, tags, content, category, dir_path)
    VALUES
      ('s1', 'typescript-linter', 'A linting tool for TypeScript projects', '["lint"]', 'Lint TS code', 'skill', 'skills/typescript-linter'),
      ('s2', 'react-testing', 'Testing utilities for React components', '["react"]', 'Test React', 'agent', 'skills/react-testing');
  `);
  const db = drizzle({ client: raw, schema: sqliteSchema });
  return { db: db as unknown as AppDatabase, raw };
}

describe("searchSkills - sqlite", () => {
  it("returns recent items with null snippet for empty query", async () => {
    const { db, raw } = makeSqliteDb();
    try {
      const results = await searchSkills(db, { limit: 20, offset: 0 }, "sqlite");
      expect(results).toHaveLength(2);
      for (const r of results) expect(r.snippet).toBeNull();
    } finally {
      raw.close();
    }
  });

  it("runs FTS5 match with highlighted snippet and camelCase mapping", async () => {
    const { db, raw } = makeSqliteDb();
    try {
      const results = await searchSkills(
        db,
        { query: "typescript", limit: 20, offset: 0 },
        "sqlite",
      );
      const match = results.find((r) => r.name === "typescript-linter");
      expect(match).toBeDefined();
      expect(match?.snippet).toContain("<mark>");
      expect(match).toHaveProperty("dirPath");
      expect(match?.createdAt).toBeInstanceOf(Date);
    } finally {
      raw.close();
    }
  });

  it("filters by category on the empty-query path", async () => {
    const { db, raw } = makeSqliteDb();
    try {
      const results = await searchSkills(
        db,
        { category: "agent", limit: 20, offset: 0 },
        "sqlite",
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("react-testing");
    } finally {
      raw.close();
    }
  });

  it("scopes results to a user on both the FTS and empty-query paths", async () => {
    const raw = new Database(":memory:");
    raw.exec(`
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        author TEXT,
        version TEXT,
        content TEXT NOT NULL,
        dir_path TEXT,
        category TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
    initFTS(raw);
    raw.exec(`
      INSERT INTO skills (id, user_id, name, description, tags, content, category)
      VALUES
        ('a1', 'user-a', 'alpha-widget', 'widget for alpha', '[]', 'alpha content', 'skill'),
        ('b1', 'user-b', 'beta-widget', 'widget for beta', '[]', 'beta content', 'skill');
    `);
    const db = drizzle({ client: raw, schema: sqliteSchema }) as unknown as AppDatabase;
    try {
      const ftsHits = await searchSkills(
        db,
        { query: "widget", userId: "user-a", limit: 20, offset: 0 },
        "sqlite",
      );
      expect(ftsHits.map((r) => r.name)).toEqual(["alpha-widget"]);

      const recentHits = await searchSkills(
        db,
        { userId: "user-b", limit: 20, offset: 0 },
        "sqlite",
      );
      expect(recentHits.map((r) => r.name)).toEqual(["beta-widget"]);
    } finally {
      raw.close();
    }
  });

  describe("same-named skills owned by different users", () => {
    // Per-user uniqueness lets Alice and Bob each own a skill with an identical
    // name and description. Only Bob's content mentions "confidential".
    function makeTwinSkillsDb(setupFts: (raw: Database.Database) => void) {
      const raw = new Database(":memory:");
      raw.exec(`
        CREATE TABLE skills (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          author TEXT,
          version TEXT,
          content TEXT NOT NULL,
          dir_path TEXT,
          category TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(user_id, name)
        );
      `);
      setupFts(raw);
      raw.exec(`
        INSERT INTO skills (id, user_id, name, description, content)
        VALUES
          ('alice-deploy', 'alice', 'deploy', 'Deploy helper', 'shared public rollout steps'),
          ('bob-deploy', 'bob', 'deploy', 'Deploy helper', 'shared rollout uses the confidential staging password');
      `);
      const db = drizzle({ client: raw, schema: sqliteSchema });
      return { db: db as unknown as AppDatabase, raw };
    }

    async function search(db: AppDatabase, query: string, userId: string) {
      return searchSkills(
        db,
        { query, userId, limit: 20, offset: 0 },
        "sqlite",
      );
    }

    it("never returns another user's FTS document or snippet", async () => {
      const { db, raw } = makeTwinSkillsDb(initFTS);
      try {
        // The term only exists in Bob's document: Alice must get nothing back,
        // not her own row decorated with Bob's content snippet.
        expect(await search(db, "confidential", "alice")).toEqual([]);

        const bobHits = await search(db, "confidential", "bob");
        expect(bobHits.map((r) => r.id)).toEqual(["bob-deploy"]);
        expect(bobHits[0]?.snippet).toContain("<mark>confidential</mark>");

        // A term in both documents yields exactly one row per user, each with
        // a snippet drawn from that user's own content.
        const aliceHits = await search(db, "rollout", "alice");
        expect(aliceHits.map((r) => r.id)).toEqual(["alice-deploy"]);
        expect(aliceHits[0]?.snippet).not.toContain("confidential");
      } finally {
        raw.close();
      }
    });

    it("re-indexes only the edited skill when an identical twin is updated or deleted", async () => {
      const { db, raw } = makeTwinSkillsDb(initFTS);
      try {
        // Make the two documents byte-identical, so nothing but the skill id
        // tells them apart in the index.
        raw.exec(`
          UPDATE skills SET content = 'identical rollout notes';
        `);

        raw.exec(
          `UPDATE skills SET content = 'rotated credentials' WHERE id = 'bob-deploy'`,
        );
        expect((await search(db, "rotated", "bob")).map((r) => r.id)).toEqual([
          "bob-deploy",
        ]);
        expect(await search(db, "identical", "bob")).toEqual([]);
        expect(
          (await search(db, "identical", "alice")).map((r) => r.id),
        ).toEqual(["alice-deploy"]);

        raw.exec(`DELETE FROM skills WHERE id = 'bob-deploy'`);
        expect(await search(db, "rotated", "bob")).toEqual([]);
        expect(
          (await search(db, "identical", "alice")).map((r) => r.id),
        ).toEqual(["alice-deploy"]);
      } finally {
        raw.close();
      }
    });

    it("rebuilds a legacy name/description-keyed FTS index on init", async () => {
      // The pre-fix index: no skill id, triggers matching rows by value.
      const legacyFts = (raw: Database.Database) => {
        raw.exec(`
          CREATE VIRTUAL TABLE skills_fts USING fts5(name, description, tags, content);
          CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
            INSERT INTO skills_fts(name, description, tags, content)
            VALUES (NEW.name, NEW.description, NEW.tags, NEW.content);
          END;
        `);
      };
      const { db, raw } = makeTwinSkillsDb(legacyFts);
      try {
        initFTS(raw);
        // Idempotent: a second init on the upgraded index is a no-op.
        initFTS(raw);

        const ftsColumns = raw
          .prepare<[], { name: string }>(
            "SELECT name FROM pragma_table_info('skills_fts')",
          )
          .all()
          .map((c) => c.name);
        expect(ftsColumns).toContain("skill_id");
        const indexed = raw
          .prepare<[], { n: number }>("SELECT count(*) AS n FROM skills_fts")
          .get();
        expect(indexed?.n).toBe(2);

        expect(await search(db, "confidential", "alice")).toEqual([]);
        expect(
          (await search(db, "confidential", "bob")).map((r) => r.id),
        ).toEqual(["bob-deploy"]);

        // The legacy insert trigger was replaced, so new rows index once by id.
        raw.exec(`
          INSERT INTO skills (id, user_id, name, description, content)
          VALUES ('carol-deploy', 'carol', 'deploy', 'Deploy helper', 'confidential too');
        `);
        expect(
          (await search(db, "confidential", "carol")).map((r) => r.id),
        ).toEqual(["carol-deploy"]);
        expect(await search(db, "confidential", "alice")).toEqual([]);
      } finally {
        raw.close();
      }
    });
  });
});

describe("searchSkills - postgres", () => {
  const pgDialect = new PgDialect();

  it("issues a tsvector/tsquery search and maps rows to the shared shape", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "s1",
          name: "typescript-linter",
          description: "A linting tool for TypeScript projects",
          tags: '["lint"]',
          author: null,
          version: null,
          content: "Lint TS code",
          dir_path: "skills/typescript-linter",
          category: "skill",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          snippet: "A <mark>linting</mark> tool",
        },
      ],
    });
    const fakeDb = { execute } as unknown as AppDatabase;

    const results = await searchSkills(
      fakeDb,
      { query: "type script", category: "skill", limit: 10, offset: 5 },
      "postgres",
    );

    expect(execute).toHaveBeenCalledTimes(1);

    // Inspect the compiled SQL to prove the Postgres branch built the tsvector
    // query (not the SQLite FTS5 query).
    const compiled = pgDialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(compiled.sql).toContain("to_tsvector");
    expect(compiled.sql).toContain("to_tsquery");
    expect(compiled.sql).toContain("ts_headline");
    expect(compiled.sql).toContain("ts_rank");
    expect(compiled.sql).not.toContain("skills_fts");
    // prefix tsquery with sanitized terms is passed as a bound parameter
    expect(compiled.params).toContain("type:* & script:*");
    // category filter applied and pagination forwarded
    expect(compiled.params).toContain("skill");
    expect(compiled.params).toContain(10);
    expect(compiled.params).toContain(5);

    // Row mapping: snake_case -> camelCase, timestamps -> Date, snippet passthrough
    expect(results).toHaveLength(1);
    const row = results[0];
    expect(row?.dirPath).toBe("skills/typescript-linter");
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
    expect(row?.snippet).toContain("<mark>");
    expect(row).not.toHaveProperty("dir_path");
  });

  it("adds a user_id filter to the compiled SQL when userId is supplied", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const fakeDb = { execute } as unknown as AppDatabase;

    await searchSkills(
      fakeDb,
      { query: "widget", userId: "user-a", limit: 10, offset: 0 },
      "postgres",
    );

    const compiled = pgDialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(compiled.sql).toContain('"user_id"');
    expect(compiled.params).toContain("user-a");
  });

  it("returns no results (without querying) when the query has no usable terms", async () => {
    const execute = vi.fn();
    const fakeDb = { execute } as unknown as AppDatabase;

    const results = await searchSkills(
      fakeDb,
      { query: "!!! @@@", limit: 10, offset: 0 },
      "postgres",
    );

    expect(results).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });
});
