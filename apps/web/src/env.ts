import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@curiouslycory/auth/env";

export const env = createEnv({
  extends: [authEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    REPO_PATH: z.string().optional(),
    PORT: z.coerce.number().optional(),
    // Deployment mode (#26). `local` (default) is the filesystem-coupled
    // self-hosted experience; `hosted` makes the database canonical and disables
    // disk sync, config-file sync, and the git page. #27 sets this to `hosted`
    // in the Vercel/Neon production deployment.
    DEPLOY_MODE: z.enum(["local", "hosted"]).default("local"),
    // Database driver (#19). `sqlite` (default) is the local better-sqlite3 file;
    // `postgres` is the Neon/Vercel serverless driver over POSTGRES_URL. The
    // hosted Vercel deployment runs `postgres` (see the hosted-mode check below).
    DB_DIALECT: z.enum(["sqlite", "postgres"]).default("sqlite"),
    // Neon/Postgres connection string. Required when DB_DIALECT=postgres. Left
    // optional at the field level so local SQLite runs without it; the hosted
    // check below enforces presence for the Vercel deployment.
    POSTGRES_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,

    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Hosted-mode (#27) cross-field validation. When DEPLOY_MODE=hosted (the
   * Vercel/Neon production deployment), the full deploy env set must be present:
   * a Postgres dialect + connection string and the better-auth secret/URL and
   * GitHub OAuth credentials. The auth vars live on the `authEnv()` extend (all
   * optional there), so we read them from process.env here rather than the parsed
   * shape. This only runs on the server; local SQLite/single-user is unaffected.
   */
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((value, ctx) => {
      if (!isServer) return;
      if (value.DEPLOY_MODE !== "hosted") return;

      if (value.DB_DIALECT !== "postgres") {
        ctx.addIssue({
          code: "custom",
          message:
            "DEPLOY_MODE=hosted requires DB_DIALECT=postgres (the hosted deployment is Postgres-only).",
          path: ["DB_DIALECT"],
        });
      }
      if (!value.POSTGRES_URL) {
        ctx.addIssue({
          code: "custom",
          message:
            "DEPLOY_MODE=hosted requires POSTGRES_URL (the Neon/Postgres connection string).",
          path: ["POSTGRES_URL"],
        });
      }
      const requiredAuthEnv = [
        "AUTH_SECRET",
        "BETTER_AUTH_URL",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
      ] as const;
      for (const name of requiredAuthEnv) {
        const current = process.env[name];
        if (typeof current !== "string" || current.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: `DEPLOY_MODE=hosted requires ${name} to be set.`,
            path: [name],
          });
        }
      }
    }),
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
