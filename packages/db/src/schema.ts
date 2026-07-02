import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";
import { resolveDialect } from "./types";

/**
 * Dialect-agnostic schema surface.
 *
 * Consumers (API routers, disk-sync, the client factory) import table objects
 * from here and use the portable drizzle query builder. The exported values are
 * statically typed against the SQLite tables (the default and reference dialect)
 * so every consumer typechecks against one stable shape. At runtime, when
 * `DB_DIALECT=postgres`, the Postgres table objects are substituted so the query
 * builder emits correct Postgres SQL. This single cast at the module boundary is
 * the only place the two dialects are bridged.
 */
const active =
  resolveDialect() === "postgres"
    ? (pgSchema as unknown as typeof sqliteSchema)
    : sqliteSchema;

export const skills = active.skills;
export const variations = active.variations;
export const favorites = active.favorites;
export const compositions = active.compositions;
export const config = active.config;
export const apiTokens = active.apiTokens;
export const publishTargets = active.publishTargets;

// better-auth core tables, bridged through the same dialect switch.
export const user = active.user;
export const session = active.session;
export const account = active.account;
export const verification = active.verification;
