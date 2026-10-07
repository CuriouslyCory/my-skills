import type { Command } from "commander";
import chalk from "chalk";

import {
  createApiClient,
  friendlyApiErrorMessage,
  resolveServerUrl,
  resolveToken,
} from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { loadCredentials } from "../core/credentials.js";

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Show the currently authenticated user")
    .action(async () => {
      const config = await loadConfig();
      const credentials = await loadCredentials();
      const serverUrl = resolveServerUrl({ config, credentials });
      const token = resolveToken(credentials);

      if (!token) {
        console.error(chalk.red("Not logged in."));
        console.error(chalk.dim("Run `ms login` to authenticate."));
        process.exitCode = 1;
        return;
      }

      const client = createApiClient({ serverUrl, token });

      try {
        const session = await client.auth.getSession.query();
        if (!session?.user) {
          console.error(
            chalk.red("Your token is no longer valid (revoked or expired)."),
          );
          console.error(chalk.dim("Run `ms login` to sign in again."));
          process.exitCode = 1;
          return;
        }

        const { name, email } = session.user;
        const label = email ? `${name} (${email})` : name;
        console.log(
          `${chalk.green("✓")} ${chalk.bold(label)} ${chalk.dim(
            `${token.slice(0, 8)}…`,
          )}`,
        );
        console.log(chalk.dim(`  Server: ${serverUrl}`));
      } catch (error) {
        console.error(chalk.red(friendlyApiErrorMessage(error, serverUrl)));
        process.exitCode = 1;
      }
    });
}
