import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

const dbPath = resolve(process.env.DB_PATH ?? "./data/my-skills.db");

export default {
  schema: "./src/schema.ts",
  dialect: "sqlite",
  dbCredentials: { url: dbPath },
  tablesFilter: ["!skills_fts*"],
} satisfies Config;
