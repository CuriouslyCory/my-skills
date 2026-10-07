import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function authEnv() {
  return createEnv({
    server: {
      // Signing secret for better-auth. Required whenever multi-user auth is
      // enabled (see the final-schema check below); local single-user mode
      // falls back to a dev secret because it never trusts a signed session.
      AUTH_SECRET: z.string().min(1).optional(),
      // GitHub OAuth app credentials. When both are non-empty, multi-user auth
      // is enabled; when absent or empty the app runs in local single-user mode.
      // Empty strings are accepted (and treated as unset) so a blank env var in
      // a hosting dashboard does not fail validation.
      GITHUB_CLIENT_ID: z.string().optional(),
      GITHUB_CLIENT_SECRET: z.string().optional(),
      // Base URL of the web app, used by better-auth to build callback URLs.
      BETTER_AUTH_URL: z.url().optional(),
      NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    },
    runtimeEnv: process.env,
    /**
     * Multi-user auth (both GitHub OAuth credentials set) signs real sessions,
     * so it must never run on the well-known dev fallback secret. Mirrors
     * `isMultiUserAuthEnabled()` in `src/index.ts`, which re-checks at init in
     * case validation was skipped (CI/lint).
     */
    createFinalSchema: (shape) =>
      z.object(shape).superRefine((value, ctx) => {
        const multiUser =
          !!value.GITHUB_CLIENT_ID && !!value.GITHUB_CLIENT_SECRET;
        if (multiUser && !value.AUTH_SECRET) {
          ctx.addIssue({
            code: "custom",
            message:
              "AUTH_SECRET is required when GitHub OAuth (multi-user auth) is enabled. Generate one with `openssl rand -base64 32`.",
            path: ["AUTH_SECRET"],
          });
        }
      }),
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
