import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { initFTS } from "./fts";
import * as schema from "./schema";

const dialect = process.env.DB_DIALECT ?? "sqlite";

if (dialect !== "sqlite") {
  throw new Error(
    `Unsupported DB_DIALECT: "${dialect}". Only "sqlite" is currently supported.`,
  );
}

const dbPath = resolve(process.env.DB_PATH ?? "./data/my-skills.db");

const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

initFTS(sqlite);

export const db = drizzle({ client: sqlite, schema });
