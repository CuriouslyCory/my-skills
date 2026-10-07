import chalk from "chalk";

import type { AgentId } from "@curiouslycory/shared-types";

import type { AdapterSkillEntry } from "../adapters/index.js";
import { getEnabledAdapters } from "../adapters/index.js";

/**
 * Run adapter.install() for each enabled agent, logging results. Adapter
 * failures are warnings and never fail the overall command (symlink/copy is
 * best-effort). `quiet` suppresses all output (e.g. `ms apply --json`).
 */
export async function runAdapterInstalls(
  projectRoot: string,
  agents: AgentId[],
  skill: AdapterSkillEntry,
  opts: { quiet?: boolean } = {},
): Promise<void> {
  const adapters = getEnabledAdapters(agents);
  const deployed: string[] = [];

  for (const adapter of adapters) {
    try {
      await adapter.install(projectRoot, skill);
      deployed.push(adapter.displayName);
    } catch (err) {
      if (!opts.quiet) {
        console.warn(
          chalk.yellow(
            `  Warning: ${adapter.displayName} adapter failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          ),
        );
      }
    }
  }

  if (deployed.length > 0 && !opts.quiet) {
    console.log(chalk.cyan(`  Deployed to: ${deployed.join(", ")}`));
  }
}
