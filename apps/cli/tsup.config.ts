import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/my-skills.ts"],
  format: ["esm"],
  target: "node18",
  banner: {
    js: "#!/usr/bin/env node",
  },
  outDir: "dist/bin",
  clean: true,
  splitting: false,
  noExternal: [
    "@curiouslycory/shared-types",
    "@curiouslycory/git-service",
  ],
  external: ["simple-git"],
});
