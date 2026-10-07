import type { Config } from "drizzle-kit";

const url = process.env.POSTGRES_URL ?? "";

export default {
  schema: "./src/schema.pg.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
