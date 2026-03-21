import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config, Manifest } from "@curiouslycory/shared-types";

let mockManifest: Manifest | null = null;
let mockConfig: Config;

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => Promise.resolve(mockManifest)),
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() => Promise.resolve(mockConfig)),
}));

vi.mock("../../src/adapters/index.js", () => ({
  resolveAgents: vi.fn(() => Promise.resolve([])),
}));

import { registerListCommand } from "../../src/commands/list.js";

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

function getJsonOutput(): unknown[] {
  const jsonCall = vi.mocked(console.log).mock.calls.find(
    (call): call is [string] => typeof call[0] === "string" && call[0].startsWith("["),
  );
  if (!jsonCall) throw new Error("No JSON output found");
  return JSON.parse(jsonCall[0]) as unknown[];
}

describe("list command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerListCommand(program);

    mockManifest = null;
    mockConfig = {
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
    };

    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints 'No skills installed' when manifest is null", async () => {
    await program.parseAsync(["node", "ms", "list"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills installed"),
    );
  });

  it("prints 'No skills installed' when manifest has no skills", async () => {
    mockManifest = makeManifest({});

    await program.parseAsync(["node", "ms", "list"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No skills installed"),
    );
  });

  it("prints JSON '[]' when manifest is empty and --json is set", async () => {
    mockManifest = null;

    await program.parseAsync(["node", "ms", "list", "--json"]);

    expect(console.log).toHaveBeenCalledWith("[]");
  });

  it("lists skills from manifest in table format", async () => {
    mockManifest = makeManifest({
      "my-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abcdef1234567890",
        installedAt: new Date().toISOString(),
        agents: ["claude-code"],
      },
    });

    await program.parseAsync(["node", "ms", "list"]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("my-skill"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("owner/repo"),
    );
  });

  it("outputs JSON when --json flag is set", async () => {
    mockManifest = makeManifest({
      "json-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "abc12345deadbeef",
        installedAt: new Date().toISOString(),
        agents: ["claude-code"],
      },
    });

    await program.parseAsync(["node", "ms", "list", "--json"]);

    const parsed = getJsonOutput();
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toHaveProperty("name", "json-skill");
  });

  it("filters by --agent flag", async () => {
    mockManifest = makeManifest({
      "claude-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "aaa",
        installedAt: new Date().toISOString(),
        agents: ["claude-code"],
      },
      "cursor-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "bbb",
        installedAt: new Date().toISOString(),
        agents: ["cursor"],
      },
    });

    await program.parseAsync(["node", "ms", "list", "--agent", "claude-code", "--json"]);

    const parsed = getJsonOutput();
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toHaveProperty("name", "claude-skill");
  });

  it("filters to --favorites only", async () => {
    mockConfig.favoriteRepos = ["owner/repo"];

    mockManifest = makeManifest({
      "fav-skill": {
        source: "owner/repo",
        sourceType: "github",
        computedHash: "aaa",
        installedAt: new Date().toISOString(),
      },
      "other-skill": {
        source: "other/repo",
        sourceType: "github",
        computedHash: "bbb",
        installedAt: new Date().toISOString(),
      },
    });

    await program.parseAsync(["node", "ms", "list", "--favorites", "--json"]);

    const parsed = getJsonOutput();
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toHaveProperty("name", "fav-skill");
  });
});
