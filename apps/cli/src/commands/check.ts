import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import type { SkillEntry } from "@curiouslycory/shared-types";

import type { GitHubSource } from "../services/source-parser.js";
import { fetchRepo } from "../services/cache.js";
import { resolveSkill } from "../core/skill-resolver.js";
import { loadManifest } from "../core/manifest.js";
import { computeSkillHash } from "../core/skill-hasher.js";

type CheckStatus = "up-to-date" | "update available" | "remote unavailable";

interface CheckRow {
  name: string;
  status: CheckStatus;
  currentHash: string;
  latestHash: string;
}

/**
 * Parse an "owner/repo" source string from a manifest entry into a GitHubSource.
 */
function sourceToGitHub(source: string): GitHubSource {
  const parts = source.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid manifest source format: "${source}"`);
  }
  return {
    type: "github",
    owner: parts[0],
    repo: parts[1],
    skill: undefined,
    url: `https://github.com/${parts[0]}/${parts[1]}.git`,
  };
}

/**
 * Check a single skill for updates by fetching latest and comparing hashes.
 */
async function checkSingleSkill(
  skillName: string,
  entry: SkillEntry,
): Promise<CheckRow> {
  const currentHash = entry.computedHash.slice(0, 8);

  try {
    if (entry.sourceType !== "github") {
      return {
        name: skillName,
        status: "remote unavailable",
        currentHash,
        latestHash: "—",
      };
    }

    const githubSource = sourceToGitHub(entry.source);
    const cachePath = await fetchRepo(githubSource);
    const resolved = await resolveSkill(skillName, cachePath);

    // Compute hash of the remote version by hashing its source files
    const latestHash = await computeSkillHash(resolved.sourcePath);
    const latestHashShort = latestHash.slice(0, 8);

    const status: CheckStatus =
      latestHash === entry.computedHash ? "up-to-date" : "update available";

    return {
      name: skillName,
      status,
      currentHash,
      latestHash: latestHashShort,
    };
  } catch {
    return {
      name: skillName,
      status: "remote unavailable",
      currentHash,
      latestHash: "—",
    };
  }
}

/**
 * Print check results as a formatted table.
 */
function printCheckTable(rows: CheckRow[]): void {
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  const statusWidth = Math.max(6, ...rows.map((r) => r.status.length));
  const hashWidth = 8;

  const header =
    chalk.bold("NAME".padEnd(nameWidth)) +
    "  " +
    chalk.bold("STATUS".padEnd(statusWidth)) +
    "  " +
    chalk.bold("CURRENT".padEnd(hashWidth)) +
    "  " +
    chalk.bold("LATEST".padEnd(hashWidth));
  console.log(header);

  for (const row of rows) {
    let statusStr: string;
    switch (row.status) {
      case "up-to-date":
        statusStr = chalk.green(row.status.padEnd(statusWidth));
        break;
      case "update available":
        statusStr = chalk.yellow(row.status.padEnd(statusWidth));
        break;
      case "remote unavailable":
        statusStr = chalk.red(row.status.padEnd(statusWidth));
        break;
    }

    console.log(
      row.name.padEnd(nameWidth) +
        "  " +
        statusStr +
        "  " +
        row.currentHash.padEnd(hashWidth) +
        "  " +
        row.latestHash.padEnd(hashWidth),
    );
  }
}

export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Check which installed skills have updates available")
    .action(async () => {
      const projectRoot = process.cwd();
      const manifest = await loadManifest(projectRoot);

      if (!manifest || Object.keys(manifest.skills).length === 0) {
        console.log(
          chalk.yellow(
            "No skills installed. Use ms add <owner/repo/skill-name> to install one.",
          ),
        );
        return;
      }

      const spinner = ora("Checking for updates...").start();
      const rows: CheckRow[] = [];

      for (const [name, entry] of Object.entries(manifest.skills)) {
        spinner.text = `Checking ${name}...`;
        const row = await checkSingleSkill(name, entry);
        rows.push(row);
      }

      spinner.stop();
      console.log("");
      printCheckTable(rows);
    });
}
