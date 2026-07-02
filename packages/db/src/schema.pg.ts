import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Postgres mirror of the SQLite schema in `schema.sqlite.ts`.
 *
 * Column names and constraints match the SQLite tables exactly so the shared,
 * dialect-agnostic drizzle query builder used by the API routers produces
 * correct SQL on either dialect. Timestamps use `timestamp` (with `defaultNow`)
 * instead of the SQLite `integer`/`unixepoch()` representation.
 */
export const skills = pgTable("skills", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  tags: text("tags").notNull().default("[]"),
  author: text("author"),
  version: text("version"),
  content: text("content").notNull(),
  dirPath: text("dir_path").unique(),
  category: text("category"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const variations = pgTable("variations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags"),
  content: text("content").notNull(),
  filePath: text("file_path"),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
});

export const favorites = pgTable(
  "favorites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    repoUrl: text("repo_url").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    skillName: text("skill_name"),
    type: text("type").notNull().default("repo"),
    addedAt: timestamp("added_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.repoUrl, table.skillName)],
);

export const compositions = pgTable("compositions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  fragments: text("fragments").notNull().default("[]"),
  order: text("order").notNull().default("[]"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const config = pgTable("config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});
