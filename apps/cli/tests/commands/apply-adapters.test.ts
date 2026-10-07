import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

import { runApply } from "../../src/commands/apply.js";
import { saveManifest } from "../../src/core/manifest.js";
import { computeSkillHash } from "../../src/core/skill-hasher.js";

/**
 * Regression coverage for in-sync (`noop`) re-applies against the REAL
 * content-writing adapters (Codex, Copilot, Gemini) on a real filesystem. A noop
 * apply used to hand every adapter a placeholder with empty content, erasing
 * working agent instructions while reporting success.
 */

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
      serverUrl: "https://my-skills.dev",
    }),
  ),
}));

const SKILL_NAME = "my-skill";
const DESCRIPTION = "Does useful things";
const BODY = "Follow these real instructions.";

describe("ms apply (noop) with content-writing adapters", () => {
  let projectRoot: string;
  const originalInitCwd = process.env.INIT_CWD;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "apply-adapters-"));
    process.env.INIT_CWD = projectRoot;
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());

    const skillDir = join(projectRoot, ".agents", "skills", SKILL_NAME);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${SKILL_NAME}\ndescription: ${DESCRIPTION}\n---\n\n${BODY}\n`,
    );

    const manifest: Manifest = {
      version: 1,
      agents: ["codex", "github-copilot", "gemini-cli"],
      skills: {
        [SKILL_NAME]: {
          source: "owner/repo",
          sourceType: "github",
          computedHash: await computeSkillHash(skillDir),
          installedAt: new Date().toISOString(),
          agents: ["codex", "github-copilot", "gemini-cli"],
        },
      },
    };
    await saveManifest(projectRoot, manifest);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalInitCwd === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = originalInitCwd;
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("keeps Codex, Copilot and Gemini instructions intact across repeated re-applies", async () => {
    const first = await runApply({});
    const second = await runApply({});

    expect(first.results.map((r) => r.action)).toEqual(["noop"]);
    expect(second.results.map((r) => r.action)).toEqual(["noop"]);
    expect(second.exitCode).toBe(0);

    // Codex: [skills.<name>] keeps its description + instructions.
    const codex = parse(
      await readFile(join(projectRoot, ".codex", "config.toml"), "utf-8"),
    ) as { skills: Record<string, { description: string; instructions: string }> };
    expect(codex.skills[SKILL_NAME]?.description).toBe(DESCRIPTION);
    expect(codex.skills[SKILL_NAME]?.instructions).toContain(BODY);

    // Copilot: the managed skill block carries the real content.
    const copilot = await readFile(
      join(projectRoot, ".github", "copilot-instructions.md"),
      "utf-8",
    );
    expect(copilot).toContain(BODY);

    // Gemini: command TOML has the instructions; GEMINI.md references it once.
    const geminiCommand = parse(
      await readFile(
        join(projectRoot, ".gemini", "commands", `${SKILL_NAME}.toml`),
        "utf-8",
      ),
    ) as { description: string; instructions: string };
    expect(geminiCommand.description).toBe(DESCRIPTION);
    expect(geminiCommand.instructions).toContain(BODY);

    const geminiMd = await readFile(join(projectRoot, "GEMINI.md"), "utf-8");
    expect(geminiMd.match(new RegExp(`\\*\\*${SKILL_NAME}\\*\\*`, "g"))).toHaveLength(1);
    expect(geminiMd).toContain(`**${SKILL_NAME}**: ${DESCRIPTION}`);
  });
});
