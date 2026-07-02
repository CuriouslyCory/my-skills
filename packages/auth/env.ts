import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function authEnv() {
  return createEnv({
    server: {
      // Signing secret for better-auth. Falls back to a dev secret when unset.
      AUTH_SECRET: z.string().min(1).optional(),
      // GitHub OAuth app credentials. When both are non-empty, multi-user auth
      // is enabled; when absent or empty the app runs in local single-user mode.
      // Empty strings are accepted (and treated as unset) so a blank env var in
      // a hosting dashboard does not fail validation.
      GITHUB_CLIENT_ID: z.string().optional(),
      GITHUB_CLIENT_SECRET: z.string().optional(),
      // Base URL of the web app, used by better-auth to build callback URLs.
      BETTER_AUTH_URL: z.string().url().optional(),
      NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
