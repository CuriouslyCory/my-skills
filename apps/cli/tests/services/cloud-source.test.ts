import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type * as FsPromises from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CloudArtifact } from "../../src/services/cloud-source.js";
import {
  assertSafeArtifactName,
  entryDeployDir,
  materializeCloudArtifact,
} from "../../src/services/cloud-source.js";

// Pass-through fs so individual tests can observe the temp dir or inject a
// write failure, while everything else hits the real filesystem.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    mkdtemp: vi.fn(actual.mkdtemp),
    writeFile: vi.fn(actual.writeFile),
  };
});

function makeArtifact(
  over: Partial<NonNullable<CloudArtifact>> = {},
): NonNullable<CloudArtifact> {
  return {
    id: "id-1",
    name: "my-skill",
    description: "A skill",
    category: "skill",
    content: "Do the thing.",
    author: null,
    version: null,
    tags: [],
    updatedAt: new Date(),
    ...over,
  };
}

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

/** The temp root created by the most recent `mkdtemp` call. */
async function lastTmpRoot(): Promise<string | undefined> {
  const result = vi.mocked(mkdtemp).mock.results.at(-1);
  return result ? ((await result.value) as string) : undefined;
}

describe("cloud-source", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("materializeCloudArtifact", () => {
    it("writes SKILL.md under <tmp>/<name> and cleans it up", async () => {
      const { resolved, category, cleanup } = await materializeCloudArtifact(
        makeArtifact({ category: "agent" }),
      );

      expect(category).toBe("agent");
      expect(resolved.name).toBe("my-skill");
      const skillMd = await readFile(
        join(resolved.sourcePath, "SKILL.md"),
        "utf-8",
      );
      expect(skillMd).toContain("Do the thing.");

      await cleanup();
      expect(await exists(resolved.sourcePath)).toBe(false);
    });

    it.each(["../evil", "..", ".", "a/b", "a\\b", "nested/../../x", "nul\0byte", ""])(
      "rejects the unsafe name %j before touching the filesystem",
      async (name) => {
        await expect(
          materializeCloudArtifact(makeArtifact({ name })),
        ).rejects.toThrow(/single path segment/);
        expect(mkdtemp).not.toHaveBeenCalled();
      },
    );

    it("removes the temp dir when writing SKILL.md fails", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC"));

      await expect(materializeCloudArtifact(makeArtifact())).rejects.toThrow(
        "ENOSPC",
      );

      const tmpRoot = await lastTmpRoot();
      expect(tmpRoot).toBeDefined();
      expect(await exists(tmpRoot ?? "")).toBe(false);
    });
  });

  describe("assertSafeArtifactName", () => {
    it("accepts ordinary skill names", () => {
      expect(() => assertSafeArtifactName("my-skill.v2")).not.toThrow();
    });
  });

  describe("entryDeployDir", () => {
    it("routes cloud entries to their category's deploy dir", () => {
      expect(
        entryDeployDir(
          { sourceType: "cloud", category: "agent" },
          "/proj",
          "/proj/.agents/skills",
        ),
      ).toBe(join("/proj", ".agents/agents"));
    });

    it("defaults a category-less cloud entry to the skills dir", () => {
      expect(
        entryDeployDir({ sourceType: "cloud" }, "/proj", "/custom/skills"),
      ).toBe(join("/proj", ".agents/skills"));
    });

    it("uses the default target dir for github/local entries", () => {
      expect(
        entryDeployDir({ sourceType: "github" }, "/proj", "/custom/skills"),
      ).toBe("/custom/skills");
    });
  });
});
