import { rm } from "node:fs/promises";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB client to prevent real SQLite initialization at import time.
vi.mock("@curiouslycory/db/client", () => ({
  db: {},
}));

// Mock config-sync to avoid filesystem writes.
vi.mock("../../lib/config-sync", () => ({
  syncConfigToFile: vi.fn().mockResolvedValue(undefined),
}));

const { createTestCaller } = await import("../../test-utils");

/**
 * The personal library router (#25) serves the caller's own artifacts to the CLI.
 * Both procedures are protected + per-user scoped (#21): a caller only ever sees
 * their own rows, and `get` resolves by the per-user-unique artifact name.
 */
describe("library router", () => {
  let rawDb: Database.Database;
  let repoPath: string;
  let userA: ReturnType<
    Awaited<ReturnType<typeof createTestCaller>>["callerFor"]
  >;
  let userB: ReturnType<
    Awaited<ReturnType<typeof createTestCaller>>["callerFor"]
  >;

  beforeAll(async () => {
    const ctx = await createTestCaller();
    rawDb = ctx.rawDb;
    repoPath = ctx.repoPath;
    userA = ctx.callerFor({ id: "user-a" });
    userB = ctx.callerFor({ id: "user-b" });
  });

  beforeEach(() => {
    rawDb.exec("DELETE FROM skills");
  });

  afterAll(async () => {
    rawDb.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("list returns only the caller's artifacts (metadata, no content)", async () => {
    await userA.skill.create({
      name: "a-skill",
      description: "A skill",
      content: "secret-a",
    });
    await userA.artifact.create({
      name: "a-agent",
      description: "A agent",
      category: "agent",
      content: "agent-body",
    });
    await userB.skill.create({
      name: "b-skill",
      description: "B skill",
      content: "secret-b",
    });

    const aList = await userA.library.list();
    const bList = await userB.library.list();

    expect(aList.map((i) => i.name).sort()).toEqual(["a-agent", "a-skill"]);
    expect(bList.map((i) => i.name)).toEqual(["b-skill"]);
    // Metadata only: no content field on list rows.
    expect(aList[0]).not.toHaveProperty("content");
    // Category is surfaced for deploy targeting.
    const agentRow = aList.find((i) => i.name === "a-agent");
    expect(agentRow?.category).toBe("agent");
  });

  it("list can filter by category", async () => {
    await userA.skill.create({
      name: "s1",
      description: "s",
      content: "x",
    });
    await userA.artifact.create({
      name: "p1",
      description: "p",
      category: "prompt",
      content: "y",
    });

    const prompts = await userA.library.list({ category: "prompt" });
    expect(prompts.map((i) => i.name)).toEqual(["p1"]);
  });

  it("get returns full content for the caller's own artifact", async () => {
    await userA.skill.create({
      name: "mine",
      description: "desc",
      content: "the-body",
    });

    const got = await userA.library.get({ name: "mine" });
    expect(got?.name).toBe("mine");
    expect(got?.content).toBe("the-body");
    expect(got?.category).toBe("skill");
  });

  it("get cannot read another user's artifact (per-user scoped)", async () => {
    await userB.skill.create({
      name: "b-private",
      description: "B",
      content: "hidden",
    });

    expect(await userA.library.get({ name: "b-private" })).toBeNull();
    expect((await userB.library.get({ name: "b-private" }))?.content).toBe(
      "hidden",
    );
  });

  it("get returns null for an unknown name", async () => {
    expect(await userA.library.get({ name: "nope" })).toBeNull();
  });
});
