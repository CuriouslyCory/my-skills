import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SkillFrontmatter } from "@curiouslycory/shared-types";
import { buildSkillContent } from "@curiouslycory/shared-types";

import { discoverSkills } from "../../src/services/cache.js";

/**
 * Proves the agentskills.io layout the publish feature (#29) writes to GitHub is
 * installable by the existing `ms add owner/repo` path: the server renders each
 * artifact with `buildSkillContent` into `<name>/SKILL.md`, and the CLI's real
 * `discoverSkills` must find every one. This mirrors the server render exactly
 * (same `buildSkillContent`), so it is a faithful end-to-end layout check.
 */
describe("published layout is discoverSkills-compatible", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "publish-layout-"));
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  async function writeSkill(name: string, description: string, body: string) {
    const dir = join(repoDir, name);
    await mkdir(dir, { recursive: true });
    const frontmatter: SkillFrontmatter = { name, description };
    await writeFile(
      join(dir, "SKILL.md"),
      buildSkillContent(frontmatter, body),
      "utf-8",
    );
  }

  it("discovers every published skill directory at repo root", async () => {
    await writeSkill("code-review", "Review code carefully", "Do the review.\n");
    await writeSkill(
      "commit-writer",
      "Write conventional commits",
      "Write a commit.\n",
    );

    const discovered = await discoverSkills(repoDir);
    const byName = new Map(discovered.map((s) => [s.name, s]));

    expect(byName.get("code-review")?.description).toBe("Review code carefully");
    expect(byName.get("commit-writer")?.description).toBe(
      "Write conventional commits",
    );
    expect(discovered).toHaveLength(2);
  });
});
