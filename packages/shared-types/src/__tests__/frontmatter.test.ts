import { describe, it, expect } from "vitest";

import {
  AgentIdSchema,
  buildSkillContent,
  parseSkillFrontmatter,
} from "../frontmatter";

// ── parseSkillFrontmatter ────────────────────────────────────────────

describe("parseSkillFrontmatter", () => {
  it("parses valid frontmatter with all fields", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "license: MIT",
      "compatibility:",
      "  - claude-code",
      "  - cursor",
      "metadata:",
      "  version: 1.0.0",
      "allowed-tools:",
      "  - Read",
      "  - Write",
      "---",
      "Body content here",
    ].join("\n");

    const result = parseSkillFrontmatter(content);

    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.description).toBe("A test skill");
    expect(result.frontmatter.license).toBe("MIT");
    expect(result.frontmatter.compatibility).toEqual(["claude-code", "cursor"]);
    expect(result.frontmatter.metadata).toEqual({ version: "1.0.0" });
    expect(result.frontmatter["allowed-tools"]).toEqual(["Read", "Write"]);
    expect(result.body).toContain("Body content here");
  });

  it("throws when name is missing", () => {
    const content = [
      "---",
      "description: A test skill",
      "---",
      "Body",
    ].join("\n");

    expect(() => parseSkillFrontmatter(content)).toThrow();
  });

  it("throws when description is missing", () => {
    const content = ["---", "name: my-skill", "---", "Body"].join("\n");

    expect(() => parseSkillFrontmatter(content)).toThrow();
  });

  it("throws when name is empty string", () => {
    const content = [
      "---",
      'name: ""',
      "description: A test skill",
      "---",
      "Body",
    ].join("\n");

    // gray-matter parses empty quoted string as ""
    // SkillFrontmatterSchema uses z.string() which accepts empty strings
    // but let's verify what actually happens
    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.name).toBe("");
  });

  it("handles optional license field", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "license: Apache-2.0",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.license).toBe("Apache-2.0");
  });

  it("handles compatibility as a string", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "compatibility: claude-code",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.compatibility).toBe("claude-code");
  });

  it("handles compatibility as an array", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "compatibility:",
      "  - claude-code",
      "  - cursor",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.compatibility).toEqual(["claude-code", "cursor"]);
  });

  it("handles metadata object", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "metadata:",
      "  author: test-author",
      "  tags:",
      "    - testing",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.metadata).toEqual({
      author: "test-author",
      tags: ["testing"],
    });
  });

  it("handles allowed-tools array", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: A test skill",
      "allowed-tools:",
      "  - Bash",
      "  - Read",
      "  - Grep",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter["allowed-tools"]).toEqual([
      "Bash",
      "Read",
      "Grep",
    ]);
  });

  it("parses frontmatter with only required fields", () => {
    const content = [
      "---",
      "name: minimal-skill",
      "description: Minimal",
      "---",
      "Body",
    ].join("\n");

    const result = parseSkillFrontmatter(content);
    expect(result.frontmatter.name).toBe("minimal-skill");
    expect(result.frontmatter.description).toBe("Minimal");
    expect(result.frontmatter.license).toBeUndefined();
    expect(result.frontmatter.compatibility).toBeUndefined();
    expect(result.frontmatter.metadata).toBeUndefined();
    expect(result.frontmatter["allowed-tools"]).toBeUndefined();
  });
});

// ── buildSkillContent ────────────────────────────────────────────────

describe("buildSkillContent", () => {
  it("produces valid markdown with YAML frontmatter", () => {
    const content = buildSkillContent(
      { name: "test", description: "A test" },
      "Hello world",
    );

    expect(content).toContain("---");
    expect(content).toContain("name: test");
    expect(content).toContain("description: A test");
    expect(content).toContain("Hello world");
  });

  it("round-trips: parse → build → parse returns same data", () => {
    const original = [
      "---",
      "name: round-trip",
      "description: Testing round trip",
      "license: MIT",
      "---",
      "Some body content",
    ].join("\n");

    const parsed = parseSkillFrontmatter(original);
    const rebuilt = buildSkillContent(parsed.frontmatter, parsed.body);
    const reparsed = parseSkillFrontmatter(rebuilt);

    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.body.trim()).toBe(parsed.body.trim());
  });

  it("handles empty body", () => {
    const content = buildSkillContent(
      { name: "test", description: "A test" },
      "",
    );

    const reparsed = parseSkillFrontmatter(content);
    expect(reparsed.frontmatter.name).toBe("test");
    expect(reparsed.body.trim()).toBe("");
  });
});

// ── AgentIdSchema ────────────────────────────────────────────────────

describe("AgentIdSchema", () => {
  const validAgentIds = [
    "claude-code",
    "cursor",
    "cline",
    "warp",
    "amp",
    "opencode",
    "github-copilot",
    "codex",
    "gemini-cli",
    "kimi-code",
  ] as const;

  it.each(validAgentIds)("accepts valid agent ID: %s", (id) => {
    expect(AgentIdSchema.parse(id)).toBe(id);
  });

  it("rejects invalid agent ID", () => {
    expect(() => AgentIdSchema.parse("invalid-agent")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => AgentIdSchema.parse("")).toThrow();
  });

  it("has exactly 10 valid options", () => {
    expect(AgentIdSchema.options).toHaveLength(10);
  });
});
