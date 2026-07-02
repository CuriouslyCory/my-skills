import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type * as sqliteSchema from "./schema.sqlite";

/**
 * Supported database dialects, selected at runtime via the `DB_DIALECT`
 * environment variable. SQLite is the default when unset.
 */
export type DbDialect = "sqlite" | "postgres";

/**
 * The shared, dialect-agnostic database type exposed to consumers.
 *
 * Both the better-sqlite3 and neon-http drizzle clients expose the same query
 * builder surface (`select`, `insert`, `update`, `delete`, `query`, `execute`).
 * We type the exported client against the SQLite driver (the reference dialect)
 * so callers have one stable type; the Postgres client is bridged to it with a
 * single cast in the client factory.
 */
export type Database = BetterSQLite3Database<typeof sqliteSchema>;

/**
 * Resolves the active dialect from the environment, defaulting to `sqlite`.
 * Unknown values fall back to `sqlite` to preserve existing local behavior.
 */
export function resolveDialect(value = process.env.DB_DIALECT): DbDialect {
  return value === "postgres" ? "postgres" : "sqlite";
}
