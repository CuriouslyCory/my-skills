import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";

import { initFTS } from "./fts";
import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";
import type { Database as AppDatabase } from "./types";
import { resolveDialect } from "./types";

/**
 * The dialect the client was initialized with, resolved from `DB_DIALECT`.
 * Defaults to `sqlite` when unset.
 */
export const dbDialect = resolveDialect();

function createSqliteClient(): AppDatabase {
  const dbPath = resolve(process.env.DB_PATH ?? "./data/my-skills.db");

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

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
