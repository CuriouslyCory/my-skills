import { defineConfig } from "eslint/config";

import { baseConfig } from "@curiouslycory/eslint-config/base";
import { reactConfig } from "@curiouslycory/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
);
