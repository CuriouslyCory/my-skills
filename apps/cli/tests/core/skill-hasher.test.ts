import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeSkillHash } from "../../src/core/skill-hasher.js";

describe("skill-hasher", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "hasher-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("computes a hash for a directory with files", async () => {
    await writeFile(join(testDir, "index.md"), "# My Skill");
    await writeFile(join(testDir, "config.json"), '{"key": "value"}');

    const hash = await computeSkillHash(testDir);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic hashes (same content = same hash)", async () => {
    await writeFile(join(testDir, "a.txt"), "hello");
    await writeFile(join(testDir, "b.txt"), "world");

    const hash1 = await computeSkillHash(testDir);

    // Create second directory with same content
    const testDir2 = await mkdtemp(join(tmpdir(), "hasher-test-"));
    await writeFile(join(testDir2, "a.txt"), "hello");
    await writeFile(join(testDir2, "b.txt"), "world");

    const hash2 = await computeSkillHash(testDir2);
    await rm(testDir2, { recursive: true, force: true });

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different content", async () => {
    await writeFile(join(testDir, "file.txt"), "content-a");
    const hash1 = await computeSkillHash(testDir);

    await writeFile(join(testDir, "file.txt"), "content-b");
    const hash2 = await computeSkillHash(testDir);

    expect(hash1).not.toBe(hash2);
  });

  it("handles nested directories", async () => {
    await mkdir(join(testDir, "sub"), { recursive: true });
    await writeFile(join(testDir, "root.txt"), "root");
    await writeFile(join(testDir, "sub", "nested.txt"), "nested");

    const hash = await computeSkillHash(testDir);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sorts files for deterministic ordering regardless of creation order", async () => {
    // Create files in one order
    const dir1 = await mkdtemp(join(tmpdir(), "hasher-order-"));
    await writeFile(join(dir1, "b.txt"), "B");
    await writeFile(join(dir1, "a.txt"), "A");

    // Create files in reverse order
    const dir2 = await mkdtemp(join(tmpdir(), "hasher-order-"));
    await writeFile(join(dir2, "a.txt"), "A");
    await writeFile(join(dir2, "b.txt"), "B");

    const hash1 = await computeSkillHash(dir1);
    const hash2 = await computeSkillHash(dir2);

    await rm(dir1, { recursive: true, force: true });
    await rm(dir2, { recursive: true, force: true });

    expect(hash1).toBe(hash2);
  });
});
