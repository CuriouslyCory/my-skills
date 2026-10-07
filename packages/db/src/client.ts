import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";

import type { Database as AppDatabase } from "./types";
import { initFTS } from "./fts";
import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";
import { resolveDialect } from "./types";

/**
 * The dialect the client was initialized with, resolved from `DB_DIALECT`.
 * Defaults to `sqlite` when unset.
 */
export const dbDialect = resolveDialect();

// The `better-sqlite3` constructor type, built from a type-only import so no
// runtime import of the native module is emitted (only the lazy `require` below
// loads it). We reconstruct the `new (...)` signature because the package's
// `DatabaseConstructor` type is not reachable through the default type import.
type SqliteDriver = new (
  filename?: string | Buffer,
  options?: BetterSqlite3.Options,
) => BetterSqlite3.Database;

/**
 * Loads the `better-sqlite3` native driver lazily, only when the SQLite path is
 * actually taken. Importing it at module top level would pull in the native
 * addon in every mode (including `postgres`), which breaks serverless builds
 * (Vercel) where the addon is neither built nor needed. Using `createRequire`
 * keeps the load synchronous so the exported `db` stays a synchronous value.
 */
function loadSqliteDriver(): SqliteDriver {
  const require = createRequire(import.meta.url);
  return require("better-sqlite3") as SqliteDriver;
}

function createSqliteClient(): AppDatabase {
  const dbPath = resolve(process.env.DB_PATH ?? "./data/my-skills.db");

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const Database = loadSqliteDriver();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  initFTS(sqlite);

  return drizzleSqlite({ client: sqlite, schema: sqliteSchema });
}

function createPostgresClient(): AppDatabase {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'DB_DIALECT is "postgres" but POSTGRES_URL is not set. Provide a Neon/Postgres connection string.',
    );
  }

  const client = neon(url);
  // The neon-http and better-sqlite3 drizzle clients share the same query
  // builder surface. We expose one stable type (the SQLite reference type) to
  // consumers; the Postgres tables are substituted via the schema module so the
  // builder emits correct Postgres SQL at runtime. Search's dialect-specific raw
  // SQL is isolated in `searchSkills`.
  return drizzleNeon({
    client,
    schema: pgSchema,
  }) as unknown as AppDatabase;
}

export const db: AppDatabase =
  dbDialect === "postgres" ? createPostgresClient() : createSqliteClient();
