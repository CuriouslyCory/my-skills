import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // The client-factory tests dynamically import the client, which loads the
    // better-sqlite3 native addon and runs initFTS on a real file. Under the
    // full parallel test run (turbo drives every package at once) that native
    // I/O can exceed vitest's 5s default, so give this package headroom.
    testTimeout: 20000,
  },
});
