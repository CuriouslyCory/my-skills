import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDialect } from "../types";

/**
 * The SQLite client runs `initFTS`, which attaches triggers to the `skills`
 * table. In normal use `pnpm db:push` creates the tables first; here we seed a
 * minimal `skills` table so opening a fresh file mirrors that precondition.
 */
function seedSkillsTable(path: string): void {
  const seed = new Database(path);
  seed.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL
    );
  `);
  seed.close();
}

describe("resolveDialect", () => {
  it("returns sqlite for an empty value", () => {
    expect(resolveDialect("")).toBe("sqlite");
  });

  it("returns sqlite for the explicit 'sqlite' value", () => {
    expect(resolveDialect("sqlite")).toBe("sqlite");
  });

  it("returns postgres for the 'postgres' value", () => {
    expect(resolveDialect("postgres")).toBe("postgres");
  });

  it("falls back to sqlite for unknown values", () => {
    expect(resolveDialect("mysql")).toBe("sqlite");
  });

  it("reads DB_DIALECT from the environment by default", () => {
    vi.stubEnv("DB_DIALECT", "postgres");
    expect(resolveDialect()).toBe("postgres");
    vi.unstubAllEnvs();
  });
});

describe("client factory", () => {
  const tmpDbPath = join(tmpdir(), `db-client-test-${Date.now()}.db`);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${tmpDbPath}${suffix}`, { force: true });
    }
  });

  it("defaults to the sqlite driver when DB_DIALECT is unset", async () => {
    seedSkillsTable(tmpDbPath);
    vi.stubEnv("DB_DIALECT", "");
    vi.stubEnv("DB_PATH", tmpDbPath);
    vi.resetModules();

    const mod = await import("../client");

    expect(mod.dbDialect).toBe("sqlite");
    expect(mod.db).toBeDefined();
    // SQLite drizzle client exposes the raw `all` escape hatch used by FTS search.
    expect(typeof mod.db.all).toBe("function");
  });

  it("selects the neon-http driver when DB_DIALECT=postgres", async () => {
    vi.stubEnv("DB_DIALECT", "postgres");
    vi.stubEnv("POSTGRES_URL", "postgresql://user:pass@localhost:5432/db");
    vi.resetModules();

    const mod = await import("../client");

    expect(mod.dbDialect).toBe("postgres");
    expect(mod.db).toBeDefined();
  });

  it("throws when DB_DIALECT=postgres but POSTGRES_URL is missing", async () => {
    vi.stubEnv("DB_DIALECT", "postgres");
    vi.stubEnv("POSTGRES_URL", "");
    vi.resetModules();

    await expect(import("../client")).rejects.toThrow(/POSTGRES_URL/);
  });
});
