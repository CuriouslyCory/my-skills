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
  /**
   * Builds an additional caller bound to the SAME db and repoPath but acting as
   * a different user. Used to prove per-user scoping (no cross-user leakage).
   */
  callerFor: (user: {
    id: string;
    name?: string;
    email?: string;
  }) => ReturnType<typeof appRouter.createCaller>;
}

/**
 * Creates an in-memory SQLite database with all tables + FTS, and returns
 * a tRPC caller bound to that database for use in tests.
 */
export async function createTestCaller(opts?: {
  session?: {
    user: { id: string; name: string; email: string };
  } | null;
}): Promise<TestContext> {
  const rawDb = new Database(":memory:");
  rawDb.pragma("journal_mode = WAL");

  // Create all tables. `user_id` defaults to the default caller's user id
  // ('test-user') so legacy raw-insert fixtures are owned by the default caller;
  // the real schema has no such default (routers always set userId explicitly).
  // Unique constraints are scoped per user, mirroring the production schema.
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS skills (
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
      user_id TEXT NOT NULL DEFAULT 'test-user',
      repo_url TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      skill_name TEXT,
      type TEXT NOT NULL DEFAULT 'repo',
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, repo_url, skill_name)
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS compositions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'test-user',
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
      user_id TEXT NOT NULL DEFAULT 'test-user',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(user_id, key)
    );
  `);

  // better-auth core tables used by the GitHub connector (#28). The connector
  // reuses the `account` row (accessToken + scope) as its per-user state.
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  initFTS(rawDb);

  const db = drizzle({ client: rawDb, schema });

  const repoPath = await mkdtemp(join(tmpdir(), "api-test-"));

  const caller = appRouter.createCaller({
    session: opts?.session ?? {
      user: { id: "test-user", name: "Test", email: "test@example.com" },
    },
    db,
    repoPath,
  });

  const callerFor: TestContext["callerFor"] = (user) =>
    appRouter.createCaller({
      session: {
        user: {
          id: user.id,
          name: user.name ?? user.id,
          email: user.email ?? `${user.id}@example.com`,
        },
      },
      db,
      repoPath,
    });

  return { db, caller, rawDb, repoPath, callerFor };
}
