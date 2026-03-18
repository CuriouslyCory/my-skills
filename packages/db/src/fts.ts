import type Database from "better-sqlite3";

/**
 * Initializes FTS5 virtual table and triggers for full-text search on the skills table.
 * Must be called with the raw better-sqlite3 instance (not the Drizzle wrapper).
 */
export function initFTS(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
      name,
      description,
      tags,
      content
    );
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills
    BEGIN
      INSERT INTO skills_fts(name, description, tags, content)
      VALUES (NEW.name, NEW.description, NEW.tags, NEW.content);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills
    BEGIN
      DELETE FROM skills_fts
      WHERE name = OLD.name AND description = OLD.description
        AND tags = OLD.tags AND content = OLD.content;
      INSERT INTO skills_fts(name, description, tags, content)
      VALUES (NEW.name, NEW.description, NEW.tags, NEW.content);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills
    BEGIN
      DELETE FROM skills_fts
      WHERE name = OLD.name AND description = OLD.description
        AND tags = OLD.tags AND content = OLD.content;
    END;
  `);
}
