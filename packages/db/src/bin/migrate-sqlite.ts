/**
 * `pnpm --filter @curiouslycory/db migrate:sqlite`, run automatically by `push`
 * before `drizzle-kit push`: upgrades a pre-ownership local database in place
 * so the push does not have to drop rows to add the required `user_id` column.
 *
 * Executed directly by Node (native type stripping), hence the explicit `.ts`
 * import specifier.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

import { upgradeLegacySqlite } from "../sqlite-upgrade.ts";

// Same resolution as `drizzle.config.ts`, so this targets the file `push` will.
const dbPath = resolve(process.env.DB_PATH ?? "./data/my-skills.db");

// A missing file is a fresh install: `drizzle-kit push` creates it from scratch.
if (existsSync(dbPath)) {
  const db = new Database(dbPath);
  try {
    const { upgradedTables, ownerId } = upgradeLegacySqlite(db);
    if (upgradedTables.length > 0) {
      console.log(
        `Upgraded legacy tables to per-user ownership: ${upgradedTables.join(", ")}` +
          (ownerId
            ? ` (existing rows now owned by local user ${ownerId})`
            : ""),
      );
    }
  } finally {
    db.close();
  }
}
