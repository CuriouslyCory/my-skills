import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { initFTS } from "@curiouslycory/db";
import * as schema from "@curiouslycory/db/schema";

import { appRouter } from "./root";

export interface TestContext {
  db: BetterSQLite3Database<typeof schema>;
  caller: ReturnType<typeof appRouter.createCaller>;
  rawDb: BetterSqlite3.Database;
  repoPath: string;
}

/**
 * Creates an in-memory SQLite database with all tables + FTS, and returns
 * a tRPC caller bound to that database for use in tests.
 */
export async function createTestCaller(opts?: {
  session?: { user: { username: string } } | null;
}): Promise<TestContext> {
  const rawDb = new Database(":memory:");
  rawDb.pragma("journal_mode = WAL");

  // Create all tables
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      version TEXT,
      content TEXT NOT NULL,
      dir_path TEXT UNIQUE,
      category TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS variations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      content TEXT NOT NULL,
      file_path TEXT,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      skill_name TEXT,
      type TEXT NOT NULL DEFAULT 'repo',
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(repo_url, skill_name)
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS compositions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      fragments TEXT NOT NULL DEFAULT '[]',
      "order" TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );
  `);

  initFTS(rawDb);

  const db = drizzle({ client: rawDb, schema });

  const repoPath = await mkdtemp(join(tmpdir(), "api-test-"));

  const caller = appRouter.createCaller({
    session: opts?.session ?? { user: { username: "test" } },
    db,
    repoPath,
  });

  return { db, caller, rawDb, repoPath };
}
