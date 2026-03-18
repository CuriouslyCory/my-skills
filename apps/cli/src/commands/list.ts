import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile } from "node:fs/promises";

import type { Command } from "commander";
import chalk from "chalk";

import type { Manifest } from "@curiouslycory/shared-types";
import { parseSkillFrontmatter } from "@curiouslycory/shared-types";

import { loadManifest } from "../core/manifest.js";
import { loadConfig } from "../core/config.js";

interface ListOptions {
  global?: boolean;
  agent?: string;
  json?: boolean;
}

interface SkillRow {
  name: string;
  source: string;
  hash: string;
  agents?: string[];
}

/**
 * Scan a skills directory and read SKILL.md frontmatter for each subdirectory.
 */
async function scanSkillsDir(skillsDir: string): Promise<SkillRow[]> {
  const rows: SkillRow[] = [];

  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return rows;
  }

  for (const entry of entries) {
    const skillMdPath = join(skillsDir, entry, "SKILL.md");
    try {
      const content = await readFile(skillMdPath, "utf-8");
      const { frontmatter } = parseSkillFrontmatter(content);
      rows.push({
        name: frontmatter.name,
        source: "local",
        hash: "—",
        agents: frontmatter.compatibility,
      });
    } catch {
      // Skip directories without valid SKILL.md
    }
  }

  return rows;
}

/**
 * Build rows from the manifest.
 */
function rowsFromManifest(manifest: Manifest): SkillRow[] {
  return Object.entries(manifest.skills).map(([name, entry]) => ({
    name,
    source: entry.source,
    hash: entry.computedHash.slice(0, 8),
    agents: entry.agents,
  }));
}

/**
 * Print rows as a formatted table using chalk.
 */
function printTable(rows: SkillRow[]): void {
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  const sourceWidth = Math.max(6, ...rows.map((r) => r.source.length));
  const hashWidth = 8;

  const header =
    chalk.bold("NAME".padEnd(nameWidth)) +
    "  " +
    chalk.bold("SOURCE".padEnd(sourceWidth)) +
    "  " +
    chalk.bold("HASH".padEnd(hashWidth));
  console.log(header);

  for (const row of rows) {
    console.log(
      row.name.padEnd(nameWidth) +
        "  " +
        row.source.padEnd(sourceWidth) +
        "  " +
        row.hash.padEnd(hashWidth),
    );
  }
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("List installed skills")
    .option("-g, --global", "List globally installed skills from ~/.agents/skills/")
    .option("--agent <name>", "Filter to skills targeting a specific agent")
    .option("--json", "Output as machine-readable JSON")
    .action(async (opts: ListOptions) => {
      let rows: SkillRow[];

      if (opts.global) {
        const globalDir = join(homedir(), ".agents", "skills");
        rows = await scanSkillsDir(globalDir);
      } else {
        const projectRoot = process.cwd();
        const manifest = await loadManifest(projectRoot);

        if (!manifest || Object.keys(manifest.skills).length === 0) {
          if (opts.json) {
            console.log("[]");
          } else {
            console.log(chalk.yellow("No skills installed."));
          }
          return;
        }

        rows = rowsFromManifest(manifest);
      }

      // Filter by agent if specified
      if (opts.agent) {
        rows = rows.filter(
          (r) => r.agents && r.agents.includes(opts.agent!),
        );
      }

      if (rows.length === 0) {
        if (opts.json) {
          console.log("[]");
        } else {
          console.log(chalk.yellow("No skills installed."));
        }
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
      } else {
        printTable(rows);
      }
    });
}
