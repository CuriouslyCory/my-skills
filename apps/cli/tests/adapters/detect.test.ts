import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectAgents } from "../../src/adapters/detect.js";

describe("detectAgents", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "detect-test-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("returns empty array for empty directory", async () => {
    const agents = await detectAgents(projectRoot);
    expect(agents).toEqual([]);
  });

  it("detects claude-code via .claude directory", async () => {
    await mkdir(join(projectRoot, ".claude"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("claude-code");
  });

  it("detects claude-code via CLAUDE.md file", async () => {
    await writeFile(join(projectRoot, "CLAUDE.md"), "# Claude\n");
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("claude-code");
  });

  it("detects cursor via .cursor directory", async () => {
    await mkdir(join(projectRoot, ".cursor"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("cursor");
  });

  it("detects cursor via .cursorrules file", async () => {
    await writeFile(join(projectRoot, ".cursorrules"), "rules\n");
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("cursor");
  });

  it("detects cline via .cline directory", async () => {
    await mkdir(join(projectRoot, ".cline"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("cline");
  });

  it("detects cline via .clinerules file", async () => {
    await writeFile(join(projectRoot, ".clinerules"), "rules\n");
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("cline");
  });

  it("detects warp via .warp directory", async () => {
    await mkdir(join(projectRoot, ".warp"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("warp");
  });

  it("detects amp via .amp directory", async () => {
    await mkdir(join(projectRoot, ".amp"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("amp");
  });

  it("detects amp via AGENTS.md file", async () => {
    await writeFile(join(projectRoot, "AGENTS.md"), "# Agents\n");
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("amp");
  });

  it("detects opencode via .opencode directory", async () => {
    await mkdir(join(projectRoot, ".opencode"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("opencode");
  });

  it("detects github-copilot via .github/copilot-instructions.md", async () => {
    await mkdir(join(projectRoot, ".github"), { recursive: true });
    await writeFile(
      join(projectRoot, ".github", "copilot-instructions.md"),
      "# Instructions\n",
    );
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("github-copilot");
  });

  it("detects codex via .codex directory", async () => {
    await mkdir(join(projectRoot, ".codex"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("codex");
  });

  it("detects gemini-cli via .gemini directory", async () => {
    await mkdir(join(projectRoot, ".gemini"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("gemini-cli");
  });

  it("detects gemini-cli via GEMINI.md file", async () => {
    await writeFile(join(projectRoot, "GEMINI.md"), "# Gemini\n");
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("gemini-cli");
  });

  it("detects kimi-code via .kimi directory", async () => {
    await mkdir(join(projectRoot, ".kimi"), { recursive: true });
    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("kimi-code");
  });

  it("detects multiple agents simultaneously", async () => {
    await mkdir(join(projectRoot, ".claude"), { recursive: true });
    await mkdir(join(projectRoot, ".cursor"), { recursive: true });
    await mkdir(join(projectRoot, ".codex"), { recursive: true });

    const agents = await detectAgents(projectRoot);
    expect(agents).toContain("claude-code");
    expect(agents).toContain("cursor");
    expect(agents).toContain("codex");
    expect(agents).toHaveLength(3);
  });

  it("does not duplicate agent when multiple markers match", async () => {
    // Both .claude dir and CLAUDE.md exist
    await mkdir(join(projectRoot, ".claude"), { recursive: true });
    await writeFile(join(projectRoot, "CLAUDE.md"), "# Claude\n");

    const agents = await detectAgents(projectRoot);
    const claudeCount = agents.filter((a) => a === "claude-code").length;
    expect(claudeCount).toBe(1);
  });
});
