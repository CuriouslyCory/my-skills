import { describe, expect, it } from "vitest";

import { mergeFragments } from "../merge.js";

describe("mergeFragments", () => {
  it("returns empty string for empty fragments array", () => {
    expect(mergeFragments([])).toBe("");
  });

  it("returns single fragment unchanged (with trailing newline)", () => {
    const fragment = "# Title\n\nSome content\n";
    expect(mergeFragments([fragment])).toBe(fragment);
  });

  it("returns single fragment with trailing newline added if missing", () => {
    const fragment = "# Title\n\nSome content";
    expect(mergeFragments([fragment])).toBe("# Title\n\nSome content\n");
  });

  it("concatenates two fragments with no overlapping headings", () => {
    const f1 = "# Alpha\n\nAlpha content\n";
    const f2 = "# Beta\n\nBeta content\n";
    const result = mergeFragments([f1, f2]);
    expect(result).toContain("# Alpha");
    expect(result).toContain("Alpha content");
    expect(result).toContain("# Beta");
    expect(result).toContain("Beta content");
    // Alpha appears before Beta (fragment order preserved)
    expect(result.indexOf("# Alpha")).toBeLessThan(result.indexOf("# Beta"));
  });

  it("merges two fragments with same ## heading under one heading", () => {
    const f1 = "## Setup\n\nStep 1: Install\n";
    const f2 = "## Setup\n\nStep 2: Configure\n";
    const result = mergeFragments([f1, f2]);
    // Only one ## Setup heading
    const matches = result.match(/## Setup/g);
    expect(matches).toHaveLength(1);
    // Both contents present
    expect(result).toContain("Step 1: Install");
    expect(result).toContain("Step 2: Configure");
  });

  it("merges headings at different levels with same name (level-offset matching)", () => {
    const f1 = "# Foo\n\nContent from f1\n";
    const f2 = "## Foo\n\nContent from f2\n";
    const result = mergeFragments([f1, f2]);
    // Content from both should be merged under one heading
    expect(result).toContain("Content from f1");
    expect(result).toContain("Content from f2");
    // Only one Foo heading (at first fragment's level)
    const fooMatches = result.match(/^#{1,6} Foo$/gm);
    expect(fooMatches).toHaveLength(1);
  });

  it("deduplicates identical lines within merged section", () => {
    const f1 = "## Rules\n\n- Always use TypeScript\n- Use strict mode\n";
    const f2 = "## Rules\n\n- Always use TypeScript\n- Use ESLint\n";
    const result = mergeFragments([f1, f2]);
    const tsMatches = result.match(/- Always use TypeScript/g);
    expect(tsMatches).toHaveLength(1);
    expect(result).toContain("- Use strict mode");
    expect(result).toContain("- Use ESLint");
  });

  it("preserves fragment ordering (first fragment content appears first)", () => {
    const f1 = "## Notes\n\nFirst note\n";
    const f2 = "## Notes\n\nSecond note\n";
    const result = mergeFragments([f1, f2]);
    expect(result.indexOf("First note")).toBeLessThan(
      result.indexOf("Second note"),
    );
  });

  it("merges and deduplicates preamble content", () => {
    const f1 = "This is the preamble\n\n# Title\n\nContent\n";
    const f2 = "This is the preamble\nExtra preamble line\n\n# Title\n\nMore content\n";
    const result = mergeFragments([f1, f2]);
    // Preamble deduplicated
    const preambleMatches = result.match(/This is the preamble/g);
    expect(preambleMatches).toHaveLength(1);
    expect(result).toContain("Extra preamble line");
    // Preamble appears before heading
    expect(result.indexOf("This is the preamble")).toBeLessThan(
      result.indexOf("# Title"),
    );
  });

  it("collapses 3+ blank lines to 2", () => {
    const f1 = "# Title\n\n\n\n\nContent with many blanks\n";
    const result = mergeFragments([f1]);
    // Should not have 4+ consecutive newlines
    expect(result).not.toMatch(/\n{4,}/);
  });

  it("handles complex scenario with 3 files merging at different heading levels", () => {
    const file1 = [
      "# Project Setup",
      "",
      "Use pnpm for package management.",
      "",
      "## Installation",
      "",
      "Run `pnpm install`",
      "",
      "## Testing",
      "",
      "Use vitest for testing.",
      "",
    ].join("\n");

    const file2 = [
      "# Code Style",
      "",
      "Follow ESLint rules.",
      "",
      "## Testing",
      "",
      "Run tests before committing.",
      "",
    ].join("\n");

    const file3 = [
      "# Project Setup",
      "",
      "Use pnpm for package management.",
      "",
      "## Deployment",
      "",
      "Deploy with Docker.",
      "",
    ].join("\n");

    const result = mergeFragments([file1, file2, file3]);

    // Project Setup appears once (merged from file1 and file3)
    const setupMatches = result.match(/# Project Setup/g);
    expect(setupMatches).toHaveLength(1);

    // "Use pnpm for package management." deduplicated
    const pnpmMatches = result.match(/Use pnpm for package management\./g);
    expect(pnpmMatches).toHaveLength(1);

    // Testing heading appears (merged from file1 and file2)
    expect(result).toContain("Testing");
    expect(result).toContain("Use vitest for testing.");
    expect(result).toContain("Run tests before committing.");

    // Code Style from file2 present
    expect(result).toContain("# Code Style");
    expect(result).toContain("Follow ESLint rules.");

    // Installation from file1
    expect(result).toContain("## Installation");
    expect(result).toContain("Run `pnpm install`");

    // Deployment from file3
    expect(result).toContain("Deployment");
    expect(result).toContain("Deploy with Docker.");

    // Fragment order: Project Setup before Code Style
    expect(result.indexOf("# Project Setup")).toBeLessThan(
      result.indexOf("# Code Style"),
    );
  });
});
