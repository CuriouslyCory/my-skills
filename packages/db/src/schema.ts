import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const skills = sqliteTable("skills", {
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdateFn(() => new Date()),
});

export const variations = sqliteTable("variations", {
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

export const favorites = sqliteTable("favorites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  repoUrl: text("repo_url").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const compositions = sqliteTable("compositions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  fragments: text("fragments").notNull().default("[]"),
  order: text("order").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdateFn(() => new Date()),
});

export const config = sqliteTable("config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});
