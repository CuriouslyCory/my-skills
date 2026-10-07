import type Database from "better-sqlite3";

/**
 * Each FTS document carries its skill's `id` (UNINDEXED: stored for joins, never
 * matched) so a hit maps back to exactly one `skills` row. Skill names are only
 * unique per user, so keying documents by name/description (the original
 * design) paired one user's row with another user's document and snippet.
 * The id is used rather than `skills.rowid` because the implicit rowid of a
 * text-keyed table is not stable across `VACUUM` or drizzle-kit table rebuilds.
 */
const CREATE_FTS_TABLE = `
  CREATE VIRTUAL TABLE skills_fts USING fts5(
    skill_id UNINDEXED,
    name,
    description,
    tags,
    content
  );
`;

const CREATE_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills
  BEGIN
    INSERT INTO skills_fts(skill_id, name, description, tags, content)
    VALUES (NEW.id, NEW.name, NEW.description, NEW.tags, NEW.content);
  END;

  CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills
  BEGIN
    DELETE FROM skills_fts WHERE skill_id = OLD.id;
    INSERT INTO skills_fts(skill_id, name, description, tags, content)
    VALUES (NEW.id, NEW.name, NEW.description, NEW.tags, NEW.content);
  END;

  CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills
  BEGIN
    DELETE FROM skills_fts WHERE skill_id = OLD.id;
  END;
`;

type FtsState = "current" | "legacy" | "missing";

function ftsState(db: Database.Database): FtsState {
  const columns = db
    .prepare<
      [],
      { name: string }
    >("SELECT name FROM pragma_table_info('skills_fts')")
    .all();
  if (columns.length === 0) return "missing";
  return columns.some((c) => c.name === "skill_id") ? "current" : "legacy";
}

/**
 * Initializes FTS5 virtual table and triggers for full-text search on the skills table.
 * Must be called with the raw better-sqlite3 instance (not the Drizzle wrapper).
 *
 * Idempotent, and upgrades in place: an index from before documents were keyed
 * by skill id (or a missing one) is rebuilt from `skills` in a single
 * transaction, replacing the old value-matching triggers along with it.
 */
export function initFTS(db: Database.Database): void {
  if (ftsState(db) !== "current") {
    // IMMEDIATE takes the write lock up front; the state is re-read under it so
    // concurrent openers (e.g. parallel build workers) rebuild at most once.
    db.transaction(() => {
      const state = ftsState(db);
      if (state === "current") return;
      if (state === "legacy") {
        db.exec(`
          DROP TRIGGER IF EXISTS skills_ai;
          DROP TRIGGER IF EXISTS skills_au;
          DROP TRIGGER IF EXISTS skills_ad;
          DROP TABLE skills_fts;
        `);
      }
      db.exec(CREATE_FTS_TABLE);
      db.exec(`
        INSERT INTO skills_fts(skill_id, name, description, tags, content)
        SELECT id, name, description, tags, content FROM skills;
      `);
      db.exec(CREATE_TRIGGERS);
    }).immediate();
  }

  // Triggers live on `skills`, so a drizzle-kit table rebuild drops them while
  // the id-keyed index stays valid; recreate any that are missing.
  db.exec(CREATE_TRIGGERS);
}
