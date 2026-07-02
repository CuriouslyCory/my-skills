import { existsSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the DB client to prevent real SQLite initialization at import time.
vi.mock("@curiouslycory/db/client", () => ({
  db: {},
}));

// Spy on the filesystem-coupled sync libraries so we can assert they are (not)
// invoked depending on DEPLOY_MODE.
const syncConfigToFileMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: syncConfigToFileMock,
}));

const scanAndSyncMock = vi
  .fn()
  .mockResolvedValue({ added: 0, updated: 0, removed: 0 });
vi.mock("../../lib/disk-sync", () => ({
  scanAndSync: scanAndSyncMock,
}));

// Import after mocks are set up.
const { createTestCaller } = await import("../../test-utils");

describe("DEPLOY_MODE gating", () => {
  let caller: Awaited<ReturnType<typeof createTestCaller>>["caller"];
  let rawDb: Database.Database;
  let repoPath: string;
  const originalDeployMode = process.env.DEPLOY_MODE;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    caller = ctx.caller;
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
  });

  beforeEach(() => {
    rawDb.exec("DELETE FROM skills");
    rawDb.exec("DELETE FROM favorites");
    rawDb.exec("DELETE FROM config");
    syncConfigToFileMock.mockClear();
    scanAndSyncMock.mockClear();
  });

  afterEach(() => {
    if (originalDeployMode === undefined) {
      delete process.env.DEPLOY_MODE;
    } else {
      process.env.DEPLOY_MODE = originalDeployMode;
    }
  });

  afterAll(() => {
    rawDb.close();
  });

  describe("hosted mode", () => {
    beforeEach(() => {
      process.env.DEPLOY_MODE = "hosted";
    });

    it("creates a skill with no dirPath and no SKILL.md on disk", async () => {
      const created = await caller.skill.create({
        name: "hosted-skill",
        description: "Lives in the DB",
        content: "hosted content",
      });

      expect(created?.dirPath).toBeNull();
      expect(created?.content).toBe("hosted content");
      expect(
        existsSync(join(repoPath, "skills", "hosted-skill", "SKILL.md")),
      ).toBe(false);
    });

    it("creates an artifact with no dirPath and no SKILL.md on disk", async () => {
      const created = await caller.artifact.create({
        name: "hosted-agent",
        description: "Lives in the DB",
        category: "agent",
        content: "hosted agent content",
      });

      expect(created?.dirPath).toBeNull();
      expect(
        existsSync(
          join(repoPath, "artifacts", "agents", "hosted-agent", "SKILL.md"),
        ),
      ).toBe(false);
    });

    it("persists skill edits to the DB content column", async () => {
      const created = await caller.skill.create({
        name: "hosted-editable",
        description: "Original",
        content: "original",
      });
      const id = (created as { id: string }).id;

      const updated = await caller.skill.update({
        id,
        content: "edited in hosted mode",
      });

      expect(updated?.content).toBe("edited in hosted mode");
      const fromDb = await caller.skill.byId({ id });
      expect(fromDb?.content).toBe("edited in hosted mode");
    });

    it("does not call syncConfigToFile on config.set", async () => {
      await caller.config.set({ key: "theme", value: "dark" });
      expect(syncConfigToFileMock).not.toHaveBeenCalled();
    });

    it("does not call syncConfigToFile on favorite.add", async () => {
      await caller.favorite.add({
        repoUrl: "https://example.com/repo",
        name: "repo",
      });
      expect(syncConfigToFileMock).not.toHaveBeenCalled();
    });

    it("does not call scanAndSync on skill.syncFromDisk", async () => {
      const result = await caller.skill.syncFromDisk();
      expect(result).toEqual({ added: 0, updated: 0, removed: 0 });
      expect(scanAndSyncMock).not.toHaveBeenCalled();
    });

    it("disables the git router", async () => {
      await expect(caller.git.status()).rejects.toThrow();
    });
  });

  describe("local mode", () => {
    beforeEach(() => {
      process.env.DEPLOY_MODE = "local";
    });

    it("creates a skill with a dirPath and writes SKILL.md to disk", async () => {
      const created = await caller.skill.create({
        name: "local-skill",
        description: "Mirrored to disk",
        content: "local content",
      });

      expect(created?.dirPath).toBe(join("skills", "local-skill"));
      expect(
        existsSync(join(repoPath, "skills", "local-skill", "SKILL.md")),
      ).toBe(true);
    });

    it("calls syncConfigToFile on config.set", async () => {
      await caller.config.set({ key: "theme", value: "light" });
      expect(syncConfigToFileMock).toHaveBeenCalledTimes(1);
    });

    it("calls syncConfigToFile on favorite.add", async () => {
      await caller.favorite.add({
        repoUrl: "https://example.com/repo-local",
        name: "repo",
      });
      expect(syncConfigToFileMock).toHaveBeenCalledTimes(1);
    });

    it("calls scanAndSync on skill.syncFromDisk", async () => {
      await caller.skill.syncFromDisk();
      expect(scanAndSyncMock).toHaveBeenCalledTimes(1);
    });

    it("does not gate the git router in local mode", async () => {
      // The git router runs GitService against repoPath (a temp dir, not a git
      // repo), so it rejects with a git error. The important assertion is that
      // the rejection is NOT the hosted-mode local-only gate.
      await expect(caller.git.status()).rejects.not.toThrow(
        /local \(self-hosted\) mode/,
      );
    });
  });
});
