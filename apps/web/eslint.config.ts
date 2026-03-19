import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@curiouslycory/eslint-config/base";
import { nextjsConfig } from "@curiouslycory/eslint-config/nextjs";
import { reactConfig } from "@curiouslycory/eslint-config/react";

export default defineConfig(
  {
    ignores: [".next/**"],
  },
  baseConfig,
  reactConfig,
  nextjsConfig,
  restrictEnvAccess,
);
