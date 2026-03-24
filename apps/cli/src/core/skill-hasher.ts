import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function computeSkillHash(dirPath: string): Promise<string> {
  const files = await collectFiles(dirPath);
  files.sort();

  const hash = createHash("sha256");

  for (const file of files) {
    const content = await readFile(join(dirPath, file));
    hash.update(file);
    hash.update(content);
  }

  return hash.digest("hex");
}

async function collectFiles(dirPath: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectFiles(
        join(dirPath, entry.name),
        relativePath,
      );
      files.push(...nested);
    } else {
      files.push(relativePath);
    }
  }

  return files;
}
