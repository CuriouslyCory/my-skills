import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    }),
  ),
}));

vi.mock("@inquirer/input", () => ({
  default: vi.fn(() => Promise.resolve("prompted-skill")),
}));

import { registerInitCommand } from "../../src/commands/init.js";

describe("init command", () => {
  let program: Command;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "init-test-"));

    program = new Command();
    program.exitOverride();
    registerInitCommand(program);

    vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("creates SKILL.md with provided name and description", async () => {
    const { default: inputMock } = await import("@inquirer/input");
    vi.mocked(inputMock).mockImplementation(() => Promise.resolve("A test skill"));

    await program.parseAsync(["node", "ms", "init", "my-test-skill"]);

    const skillFile = join(projectRoot, ".agents", "skills", "my-test-skill", "SKILL.md");
    const content = await readFile(skillFile, "utf-8");
    expect(content).toContain("name: my-test-skill");
    expect(content).toContain("A test skill");
  });

  it("errors when skill already exists without --force", async () => {
    const skillDir = join(projectRoot, ".agents", "skills", "existing-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "existing content");

    const { default: inputMock } = await import("@inquirer/input");
    vi.mocked(inputMock).mockImplementation(() => Promise.resolve("Desc"));

    // process.exit is called but our mock throws — Commander may catch it
    try {
      await program.parseAsync(["node", "ms", "init", "existing-skill"]);
    } catch {
      // expected
    }

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("overwrites existing skill with --force", async () => {
    const skillDir = join(projectRoot, ".agents", "skills", "existing-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "old content");

    const { default: inputMock } = await import("@inquirer/input");
    vi.mocked(inputMock).mockImplementation(() => Promise.resolve("New description"));

    await program.parseAsync(["node", "ms", "init", "existing-skill", "--force"]);

    const content = await readFile(join(skillDir, "SKILL.md"), "utf-8");
    expect(content).toContain("name: existing-skill");
    expect(content).not.toContain("old content");
  });

  it("errors on empty skill name", async () => {
    const { default: inputMock } = await import("@inquirer/input");
    vi.mocked(inputMock).mockImplementation(() => Promise.resolve("   "));

    try {
      await program.parseAsync(["node", "ms", "init", "   "]);
    } catch {
      // expected
    }

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be empty"),
    );
  });
});
