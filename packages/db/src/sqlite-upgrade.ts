import type Database from "better-sqlite3";

/**
 * Email of the auto-provisioned local single-user account. Local mode's
 * `ensureLocalUser` (in `@curiouslycory/auth`) resolves that account by this
 * email, so rows backfilled to it here are owned by whoever uses local mode.
 * The Postgres ownership migration (`drizzle/pg/0002_*.sql`) uses it too.
 */
export const LOCAL_USER_EMAIL = "local@my-skills.local";
export const LOCAL_USER_NAME = "Local";

/**
 * Column DDL for the tables that gained a required `user_id` (#21), frozen at
 * that schema version and copied from `drizzle-kit export` output so a later
 * `drizzle-kit push` finds nothing to change in them. Like a migration, this
 * must not track future schema edits; `push` applies those afterwards.
 */
const OWNED_TABLES: Record<
  string,
  { columns: Record<string, string>; uniqueIndexes: Record<string, string[]> }
> = {
  skills: {
    columns: {
      id: "text PRIMARY KEY NOT NULL",
      user_id: "text NOT NULL",
      name: "text NOT NULL",
      description: "text NOT NULL",
      tags: "text DEFAULT '[]' NOT NULL",
      author: "text",
      version: "text",
      content: "text NOT NULL",
      dir_path: "text",
      category: "text",
      created_at: "integer DEFAULT (unixepoch()) NOT NULL",
      updated_at: "integer DEFAULT (unixepoch()) NOT NULL",
    },
    uniqueIndexes: {
      skills_user_id_name_unique: ["user_id", "name"],
      skills_user_id_dir_path_unique: ["user_id", "dir_path"],
    },
  },
  favorites: {
    columns: {
      id: "text PRIMARY KEY NOT NULL",
      user_id: "text NOT NULL",
      repo_url: "text NOT NULL",
      name: "text NOT NULL",
      description: "text",
      skill_name: "text",
      type: "text DEFAULT 'repo' NOT NULL",
      added_at: "integer DEFAULT (unixepoch()) NOT NULL",
    },
    uniqueIndexes: {
      favorites_user_id_repo_url_skill_name_unique: [
        "user_id",
        "repo_url",
        "skill_name",
      ],
    },
  },
  compositions: {
    columns: {
      id: "text PRIMARY KEY NOT NULL",
      user_id: "text NOT NULL",
      name: "text NOT NULL",
      description: "text",
      fragments: "text DEFAULT '[]' NOT NULL",
      order: "text DEFAULT '[]' NOT NULL",
      created_at: "integer DEFAULT (unixepoch()) NOT NULL",
      updated_at: "integer DEFAULT (unixepoch()) NOT NULL",
    },
    uniqueIndexes: {},
  },
  config: {
    columns: {
      id: "text PRIMARY KEY NOT NULL",
      user_id: "text NOT NULL",
      key: "text NOT NULL",
      value: "text NOT NULL",
    },
    uniqueIndexes: {
      config_user_id_key_unique: ["user_id", "key"],
    },
  },
};

const CREATE_USER_TABLE = `
  CREATE TABLE IF NOT EXISTS \`user\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    \`email_verified\` integer DEFAULT false NOT NULL,
    \`image\` text,
    \`created_at\` integer DEFAULT (unixepoch()) NOT NULL,
    \`updated_at\` integer DEFAULT (unixepoch()) NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS \`user_email_unique\` ON \`user\` (\`email\`);
`;

const quote = (identifier: string) => `\`${identifier}\``;

function columnNames(db: Database.Database, table: string): Set<string> {
  const rows = db
    .prepare<
      [string],
      { name: string }
    >("SELECT name FROM pragma_table_info(?)")
    .all(table);
  return new Set(rows.map((row) => row.name));
}

/** Owned tables that exist but predate the `user_id` ownership column. */
function findLegacyTables(db: Database.Database): string[] {
  return Object.keys(OWNED_TABLES).filter((table) => {
    const columns = columnNames(db, table);
    return columns.size > 0 && !columns.has("user_id");
  });
}

function hasRows(db: Database.Database, table: string): boolean {
  return (
    db.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get() !== undefined
  );
}

/** Finds or creates the local user exactly as `ensureLocalUser` would. */
function ensureLocalOwner(db: Database.Database): string {
  const existing = db
    .prepare<[string], { id: string }>("SELECT id FROM `user` WHERE email = ?")
    .get(LOCAL_USER_EMAIL);
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO `user` (id, name, email, email_verified) VALUES (?, ?, ?, 1)",
  ).run(id, LOCAL_USER_NAME, LOCAL_USER_EMAIL);
  return id;
}

/**
 * Rebuilds one legacy table into its owned shape (SQLite cannot add a NOT NULL
 * foreign-key column or swap unique constraints in place), copying every
 * column the old table has and stamping each row with `ownerId`.
 */
function rebuildOwned(
  db: Database.Database,
  table: string,
  ownerId: string | null,
): void {
  const definition = OWNED_TABLES[table];
  if (!definition) throw new Error(`Unknown owned table: ${table}`);

  const staging = `__new_${table}`;
  const columnDdl = Object.entries(definition.columns).map(
    ([name, ddl]) => `${quote(name)} ${ddl}`,
  );
  db.exec(`
    CREATE TABLE ${quote(staging)} (
      ${columnDdl.join(",\n      ")},
      FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);

  const legacyColumns = columnNames(db, table);
  const copied = Object.keys(definition.columns)
    .filter((name) => name !== "user_id" && legacyColumns.has(name))
    .map(quote)
    .join(", ");
  db.prepare(
    `INSERT INTO ${quote(staging)} (\`user_id\`, ${copied}) SELECT ?, ${copied} FROM ${quote(table)}`,
  ).run(ownerId);

  db.exec(`DROP TABLE ${quote(table)};`);
  db.exec(`ALTER TABLE ${quote(staging)} RENAME TO ${quote(table)};`);
  for (const [index, columns] of Object.entries(definition.uniqueIndexes)) {
    db.exec(
      `CREATE UNIQUE INDEX ${quote(index)} ON ${quote(table)} (${columns.map(quote).join(",")});`,
    );
  }
}

export interface LegacyUpgradeResult {
  /** Tables rebuilt with a `user_id` column; empty when nothing was legacy. */
  upgradedTables: string[];
  /** The local user that now owns the pre-existing rows, if there were any. */
  ownerId: string | null;
}

/**
 * Upgrades a local SQLite database created before per-user ownership (#21),
 * so `drizzle-kit push` can then apply the current schema without dropping
 * data. Run by the package's `push` script ahead of `drizzle-kit push`.
 *
 * Pre-ownership databases were single-user, so every existing skill, favorite,
 * composition and config row is assigned to the local user (created by email
 * if missing, matching local mode's auto-provisioning). Idempotent: once all
 * owned tables have `user_id` it does nothing. The whole upgrade is one
 * transaction, so a failure leaves the database untouched.
 */
export function upgradeLegacySqlite(
  db: Database.Database,
): LegacyUpgradeResult {
  if (findLegacyTables(db).length === 0) {
    return { upgradedTables: [], ownerId: null };
  }

  // Rebuilding drops the legacy tables; with enforcement on, dropping `skills`
  // would cascade-delete every variation. The pragma is a no-op inside a
  // transaction, so it is toggled around it and integrity is verified with
  // `foreign_key_check` before commit instead.
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) === 1;
  db.pragma("foreign_keys = OFF");
  try {
    return db
      .transaction((): LegacyUpgradeResult => {
        const legacyTables = findLegacyTables(db);
        db.exec(CREATE_USER_TABLE);
        const ownerId = legacyTables.some((table) => hasRows(db, table))
          ? ensureLocalOwner(db)
          : null;

        for (const table of legacyTables) rebuildOwned(db, table, ownerId);

        const violations = db.pragma("foreign_key_check") as unknown[];
        if (violations.length > 0) {
          throw new Error(
            `Legacy SQLite upgrade left ${violations.length} foreign key violation(s); rolled back.`,
          );
        }
        return { upgradedTables: legacyTables, ownerId };
      })
      .immediate();
  } finally {
    if (foreignKeys) db.pragma("foreign_keys = ON");
  }
}
