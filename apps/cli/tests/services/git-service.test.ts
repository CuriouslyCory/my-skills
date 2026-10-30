import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

import { GitService } from "@curiouslycory/git-service";

const execFileAsync = promisify(execFile);

it("commits, clones, and fetches a local repository with the Git driver", async () => {
  const root = await mkdtemp(join(tmpdir(), "my-skills-git-driver-"));
  const sourcePath = join(root, "source");
  const clonePath = join(root, "clone");

  try {
    await execFileAsync("git", ["init", "--initial-branch=main", sourcePath]);
    for (const [key, value] of [
      ["user.name", "Dependency Test"],
      ["user.email", "test@example.com"],
      ["commit.gpgsign", "false"],
    ] as const) {
      await execFileAsync("git", ["-C", sourcePath, "config", key, value]);
    }

    const source = new GitService(sourcePath);
    await writeFile(join(sourcePath, "SKILL.md"), "First version\n");
    const initialCommit = await source.commit(["SKILL.md"], "Add skill");
    expect((await source.status()).isClean()).toBe(true);
    expect(await source.showFileAtCommit("SKILL.md", initialCommit)).toBe(
      "First version\n",
    );

    await new GitService(root).clone(sourcePath, clonePath, { depth: 1 });
    const clone = new GitService(clonePath);
    expect((await clone.branches()).current).toBe("main");
    expect((await clone.log("SKILL.md", 1)).latest?.hash).toBe(initialCommit);

    await writeFile(join(sourcePath, "SKILL.md"), "Updated version\n");
    expect(await source.diff("SKILL.md")).toContain("+Updated version");
    await source.commit(["SKILL.md"], "Update skill");
    await clone.fetch({ remote: "origin", branch: "main", prune: true });
    await clone.resetHard("origin/main");
    expect(await readFile(join(clonePath, "SKILL.md"), "utf8")).toBe(
      "Updated version\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
