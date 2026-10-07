import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initFTS } from "../fts";
import { LOCAL_USER_EMAIL, upgradeLegacySqlite } from "../sqlite-upgrade";

/**
 * The library tables exactly as `drizzle-kit push` created them before per-user
 * ownership (#21): no `user` table, no `user_id`, globally unique names.
 */
const LEGACY_DDL = `
  CREATE TABLE \`compositions\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`description\` text,
    \`fragments\` text DEFAULT '[]' NOT NULL,
    \`order\` text DEFAULT '[]' NOT NULL,
    \`created_at\` integer DEFAULT (unixepoch()) NOT NULL,
    \`updated_at\` integer DEFAULT (unixepoch()) NOT NULL
  );
  CREATE TABLE \`config\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`key\` text NOT NULL,
    \`value\` text NOT NULL
  );
  CREATE UNIQUE INDEX \`config_key_unique\` ON \`config\` (\`key\`);
  CREATE TABLE \`favorites\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`repo_url\` text NOT NULL,
    \`name\` text NOT NULL,
    \`description\` text,
    \`skill_name\` text,
    \`type\` text DEFAULT 'repo' NOT NULL,
    \`added_at\` integer DEFAULT (unixepoch()) NOT NULL
  );
  CREATE UNIQUE INDEX \`favorites_repo_url_skill_name_unique\` ON \`favorites\` (\`repo_url\`,\`skill_name\`);
  CREATE TABLE \`skills\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`description\` text NOT NULL,
    \`tags\` text DEFAULT '[]' NOT NULL,
    \`author\` text,
    \`version\` text,
    \`content\` text NOT NULL,
    \`dir_path\` text,
    \`category\` text,
    \`created_at\` integer DEFAULT (unixepoch()) NOT NULL,
    \`updated_at\` integer DEFAULT (unixepoch()) NOT NULL
  );
  CREATE UNIQUE INDEX \`skills_name_unique\` ON \`skills\` (\`name\`);
  CREATE UNIQUE INDEX \`skills_dir_path_unique\` ON \`skills\` (\`dir_path\`);
  CREATE TABLE \`variations\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`description\` text,
    \`tags\` text,
    \`content\` text NOT NULL,
    \`file_path\` text,
    \`skill_id\` text NOT NULL,
    FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
`;

function makeLegacyDb({ seed }: { seed: boolean }) {
  const raw = new Database(":memory:");
  raw.exec(LEGACY_DDL);
  if (seed) {
    raw.exec(`
      INSERT INTO skills (id, name, description, content, dir_path, created_at, updated_at)
      VALUES ('s1', 'deploy', 'Deploy helper', 'rollout steps', 'skills/deploy', 1700000000, 1700000001);
      INSERT INTO variations (id, name, content, skill_id)
      VALUES ('v1', 'deploy-fast', 'fast rollout', 's1');
      INSERT INTO favorites (id, repo_url, name, skill_name)
      VALUES ('f1', 'https://github.com/acme/skills', 'acme', 'deploy');
      INSERT INTO compositions (id, name, fragments, "order")
      VALUES ('c1', 'stack', '["s1"]', '["s1"]');
      INSERT INTO config (id, key, value) VALUES ('k1', 'theme', 'dark');
    `);
    // The pre-fix FTS index and triggers, as the app created them on main.
    raw.exec(`
      CREATE VIRTUAL TABLE skills_fts USING fts5(name, description, tags, content);
      INSERT INTO skills_fts(name, description, tags, content)
      SELECT name, description, tags, content FROM skills;
      CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
        INSERT INTO skills_fts(name, description, tags, content)
        VALUES (NEW.name, NEW.description, NEW.tags, NEW.content);
      END;
    `);
  }
  return raw;
}

const ownerOf = (raw: Database.Database, table: string) =>
  raw
    .prepare<[], { user_id: string }>(`SELECT DISTINCT user_id FROM ${table}`)
    .all()
    .map((row) => row.user_id);

describe("upgradeLegacySqlite", () => {
  it("backfills every pre-ownership row to the local user without data loss", () => {
    const raw = makeLegacyDb({ seed: true });
    try {
      const result = upgradeLegacySqlite(raw);

      expect([...result.upgradedTables].sort()).toEqual([
        "compositions",
        "config",
        "favorites",
        "skills",
      ]);
      const local = raw
        .prepare<
          [string],
          { id: string; name: string; email_verified: number }
        >("SELECT id, name, email_verified FROM user WHERE email = ?")
        .get(LOCAL_USER_EMAIL);
      expect(local).toMatchObject({ name: "Local", email_verified: 1 });
      expect(result.ownerId).toBe(local?.id);

      for (const table of ["skills", "favorites", "compositions", "config"]) {
        expect(ownerOf(raw, table)).toEqual([local?.id]);
      }
      // Every column survives the rebuild, timestamps included.
      expect(
        raw.prepare("SELECT * FROM skills WHERE id = 's1'").get(),
      ).toMatchObject({
        name: "deploy",
        dir_path: "skills/deploy",
        content: "rollout steps",
        created_at: 1700000000,
        updated_at: 1700000001,
      });
      expect(
        raw.prepare("SELECT value FROM config WHERE key = 'theme'").get(),
      ).toEqual({ value: "dark" });
      // Rebuilding `skills` must not cascade-delete its variations.
      expect(
        raw.prepare("SELECT skill_id FROM variations WHERE id = 'v1'").get(),
      ).toEqual({ skill_id: "s1" });
      expect(raw.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      raw.close();
    }
  });

  it("enforces the owned schema: required owner and per-user uniqueness", () => {
    const raw = makeLegacyDb({ seed: true });
    try {
      upgradeLegacySqlite(raw);

      expect(() =>
        raw.exec(
          `INSERT INTO skills (id, name, description, content) VALUES ('x', 'n', 'd', 'c')`,
        ),
      ).toThrow(/NOT NULL constraint failed: skills.user_id/);
      expect(() =>
        raw.exec(
          `INSERT INTO skills (id, user_id, name, description, content) VALUES ('x', 'ghost', 'n', 'd', 'c')`,
        ),
      ).toThrow(/FOREIGN KEY constraint failed/);

      // Another user may now own a skill named like the local user's one.
      raw.exec(`
        INSERT INTO user (id, name, email) VALUES ('u2', 'Bob', 'bob@example.com');
        INSERT INTO skills (id, user_id, name, description, content, dir_path)
        VALUES ('s2', 'u2', 'deploy', 'Deploy helper', 'bob steps', 'skills/deploy');
      `);
      expect(() =>
        raw.exec(
          `INSERT INTO skills (id, user_id, name, description, content) VALUES ('s3', 'u2', 'deploy', 'd', 'c')`,
        ),
      ).toThrow(/UNIQUE constraint failed: skills.user_id, skills.name/);
    } finally {
      raw.close();
    }
  });

  it("reuses an already-provisioned local user instead of creating another", () => {
    const raw = makeLegacyDb({ seed: true });
    try {
      raw.exec(`
        CREATE TABLE user (
          id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE,
          email_verified integer DEFAULT false NOT NULL, image text,
          created_at integer DEFAULT (unixepoch()) NOT NULL,
          updated_at integer DEFAULT (unixepoch()) NOT NULL
        );
        INSERT INTO user (id, name, email) VALUES ('existing-local', 'Local', '${LOCAL_USER_EMAIL}');
      `);

      expect(upgradeLegacySqlite(raw).ownerId).toBe("existing-local");
      expect(ownerOf(raw, "skills")).toEqual(["existing-local"]);
      expect(raw.prepare("SELECT count(*) AS n FROM user").get()).toEqual({
        n: 1,
      });
    } finally {
      raw.close();
    }
  });

  it("rebuilds empty legacy tables without provisioning a user", () => {
    const raw = makeLegacyDb({ seed: false });
    try {
      const result = upgradeLegacySqlite(raw);
      expect(result.upgradedTables).toHaveLength(4);
      expect(result.ownerId).toBeNull();
      expect(raw.prepare("SELECT count(*) AS n FROM user").get()).toEqual({
        n: 0,
      });
    } finally {
      raw.close();
    }
  });

  it("is a no-op on an already-upgraded or empty database", () => {
    const raw = makeLegacyDb({ seed: true });
    try {
      const first = upgradeLegacySqlite(raw);
      expect(upgradeLegacySqlite(raw)).toEqual({
        upgradedTables: [],
        ownerId: null,
      });
      expect(ownerOf(raw, "skills")).toEqual([first.ownerId]);
    } finally {
      raw.close();
    }

    const fresh = new Database(":memory:");
    try {
      expect(upgradeLegacySqlite(fresh).upgradedTables).toEqual([]);
      expect(
        fresh.prepare("SELECT count(*) AS n FROM sqlite_master").get(),
      ).toEqual({ n: 0 });
    } finally {
      fresh.close();
    }
  });

  it("leaves the search index consistent once FTS is re-initialized", () => {
    const raw = makeLegacyDb({ seed: true });
    try {
      upgradeLegacySqlite(raw);
      initFTS(raw);

      const hit = raw
        .prepare<[string], { id: string; user_id: string }>(
          `SELECT s.id, s.user_id FROM skills_fts
           JOIN skills s ON s.id = skills_fts.skill_id
           WHERE skills_fts MATCH ?`,
        )
        .all('"rollout"*');
      expect(hit).toEqual([{ id: "s1", user_id: ownerOf(raw, "skills")[0] }]);
    } finally {
      raw.close();
    }
  });
});
