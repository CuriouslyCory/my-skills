import type { Command } from "commander";
import { TRPCClientError } from "@trpc/client";
import chalk from "chalk";
import ora from "ora";

import {
  createApiClient,
  friendlyApiErrorMessage,
  resolveServerUrl,
  resolveToken,
} from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { loadCredentials } from "../core/credentials.js";

/**
 * `ms publish` — a thin client over the server-side `publish.run` procedure.
 *
 * The heavy lifting (rendering the agentskills.io layout, creating the repo, and
 * committing the tree via the Git Data API) happens on the server using the user's
 * connected GitHub account (#28/#29). This command only authenticates the CLI,
 * triggers the publish, and prints the result URL. Configuration (target repo +
 * artifact selection) lives in the web Settings UI.
 */
export function registerPublishCommand(program: Command): void {
  program
    .command("publish")
    .description(
      "Publish your personal library to GitHub as an installable skills repo",
    )
    .action(async () => {
      const config = await loadConfig();
      const credentials = await loadCredentials();
      const serverUrl = resolveServerUrl({ config, credentials });
      const token = resolveToken(credentials);

      if (!token) {
        console.error(chalk.red("Not logged in."));
        console.error(
          chalk.dim("Run `ms login` to authenticate, then try again."),
        );
        process.exitCode = 1;
        return;
      }

      const client = createApiClient({ serverUrl, token });
      const spinner = ora("Publishing your library...").start();

      try {
        const result = await client.publish.run.mutate();
        if (result.unchanged) {
          spinner.succeed("Already up to date; nothing to publish.");
        } else {
          spinner.succeed(`Published: ${chalk.bold(result.summary)}`);
        }
        if (result.url) {
          console.log(chalk.cyan(`  ${result.url}`));
        }
        if (result.commitSha) {
          console.log(chalk.dim(`  commit ${result.commitSha.slice(0, 7)}`));
        }
      } catch (error) {
        spinner.fail("Publish failed");
        // tRPC errors carry the server's actionable message (e.g. the connector
        // "not connected / missing repo scope / reconnect" guidance, or "configure
        // a target first"); surface it directly. Fall back to the network-aware
        // friendly message for offline/unknown errors.
        if (error instanceof TRPCClientError) {
          console.error(chalk.red(error.message));
        } else {
          console.error(chalk.red(friendlyApiErrorMessage(error, serverUrl)));
        }
        process.exitCode = 1;
      }
    });
}
