import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AdapterSkillEntry } from "../../src/adapters/types.js";
import { NativeAdapter } from "../../src/adapters/native.js";

function makeSkill(name: string): AdapterSkillEntry {
  return {
    name,
    sourcePath: `/tmp/skills/${name}`,
    frontmatter: {
      name,
      description: `${name} skill`,
      version: "1.0.0",
    } as AdapterSkillEntry["frontmatter"],
    content: `# ${name}\nSome content`,
    files: [],
  };
}

describe("NativeAdapter", () => {
  const adapter = new NativeAdapter("claude-code", "Claude Code");

  it("has correct id and displayName", () => {
    expect(adapter.id).toBe("claude-code");
    expect(adapter.displayName).toBe("Claude Code");
  });

  it("detect always returns true", async () => {
    expect(await adapter.detect("/nonexistent")).toBe(true);
  });

  it("install is a no-op", async () => {
    // Should not throw
    await adapter.install("/tmp/project", makeSkill("test-skill"));
  });

  it("remove is a no-op", async () => {
    await adapter.remove("/tmp/project", "test-skill");
  });

  it("sync is a no-op", async () => {
    await adapter.sync("/tmp/project", [makeSkill("a"), makeSkill("b")]);
  });

  it("getSkillsPath returns .agents/skills under project root", () => {
    expect(adapter.getSkillsPath("/my/project")).toBe(
      join("/my/project", ".agents", "skills"),
    );
  });
});
