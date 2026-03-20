import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile } from "node:fs/promises";

import type { Command } from "commander";
import chalk from "chalk";
import checkbox from "@inquirer/checkbox";

import type { Manifest } from "@curiouslycory/shared-types";
import { parseSkillFrontmatter } from "@curiouslycory/shared-types";

import { loadConfig } from "../core/config.js";
import { loadManifest } from "../core/manifest.js";
import { resolveAgents } from "../adapters/index.js";
import { removeSingleSkill } from "./remove.js";

interface ListOptions {
  global?: boolean;
  agent?: string;
  json?: boolean;
  favorites?: boolean;
  interactive?: boolean;
}

interface SkillRow {
  name: string;
  source: string;
  hash: string;
  agents?: string | string[];
  favorite?: boolean;
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
    chalk.bold("★") +
    "  " +
    chalk.bold("NAME".padEnd(nameWidth)) +
    "  " +
    chalk.bold("SOURCE".padEnd(sourceWidth)) +
    "  " +
    chalk.bold("HASH".padEnd(hashWidth));
  console.log(header);

  for (const row of rows) {
    const star = row.favorite ? chalk.yellow("★") : " ";
    console.log(
      star +
        "  " +
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
    .option("--favorites", "Show only skills from favorited repos")
    .option("-i, --interactive", "Select skills interactively to remove")
    .action(async (opts: ListOptions) => {
      const config = await loadConfig();
      const favoriteRepos = new Set(config.favoriteRepos);

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

      // Mark favorites
      for (const row of rows) {
        row.favorite = favoriteRepos.has(row.source);
      }

      // Filter by agent if specified
      if (opts.agent) {
        const agentFilter = opts.agent;
        rows = rows.filter((r) => {
          if (!r.agents) return false;
          if (typeof r.agents === "string") return r.agents.includes(agentFilter);
          return r.agents.includes(agentFilter);
        });
      }

      // Filter to favorites only
      if (opts.favorites) {
        rows = rows.filter((r) => r.favorite);
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
        return;
      }

      if (opts.interactive) {
        const selected = await checkbox({
          message: "Select skills to remove:",
          choices: rows.map((r) => {
            const star = r.favorite ? chalk.yellow("★ ") : "";
            return {
              name: `${star}${r.name} ${chalk.dim(`(${r.source})`)}`,
              value: r.name,
            };
          }),
        });

        if (selected.length === 0) {
          console.log(chalk.dim("No skills selected."));
          return;
        }

        const projectRoot = process.cwd();
        const config = await loadConfig();
        const targetDir = opts.global
          ? join(homedir(), ".agents", "skills")
          : resolve(projectRoot, config.skillsDir);
        const agents = await resolveAgents(projectRoot);
        let manifest = await loadManifest(projectRoot);

        if (!manifest) {
          console.log(chalk.yellow("No manifest found."));
          return;
        }

        for (const skillName of selected) {
          manifest = await removeSingleSkill(
            skillName,
            targetDir,
            projectRoot,
            manifest,
            true,
            agents,
          );
        }
        return;
      }

      printTable(rows);
    });
}
