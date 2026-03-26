import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function authEnv() {
  return createEnv({
    server: {
      ADMIN_USER: z.string().min(1).optional(),
      ADMIN_PASSWORD: z.string().min(1).optional(),
      AUTH_SECRET: z.string().min(1).optional(),
      NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
