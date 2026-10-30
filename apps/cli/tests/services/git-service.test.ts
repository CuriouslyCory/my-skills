import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
      ["core.autocrlf", "false"],
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

    await writeFile(join(sourcePath, "SKILL.md"), "Second version\n");
    const secondCommit = await source.commit(["SKILL.md"], "Revise skill");

    await new GitService(root).clone(
      pathToFileURL(sourcePath).href,
      clonePath,
      {
        depth: 1,
      },
    );
    const clone = new GitService(clonePath);
    expect((await clone.branches()).current).toBe("main");
    const history = await clone.log("SKILL.md");
    expect(history.all).toHaveLength(1);
    expect(history.latest?.hash).toBe(secondCommit);
    expect(
      await readFile(join(clonePath, ".git", "shallow"), "utf8"),
    ).toContain(secondCommit);

    // Exercise a checkout that converts LF to CRLF, independently of global settings.
    await execFileAsync("git", [
      "-C",
      clonePath,
      "config",
      "core.autocrlf",
      "true",
    ]);

    await writeFile(join(sourcePath, "SKILL.md"), "Updated version\n");
    expect(await source.diff("SKILL.md")).toContain("+Updated version");
    await source.commit(["SKILL.md"], "Update skill");
    await clone.fetch({ remote: "origin", branch: "main", prune: true });
    await clone.resetHard("origin/main");
    const checkedOut = await readFile(join(clonePath, "SKILL.md"), "utf8");
    expect(checkedOut.replace(/\r\n/g, "\n")).toBe("Updated version\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
