import type { Command } from "commander";
import chalk from "chalk";

import {
  createApiClient,
  resolveServerUrl,
  resolveToken,
} from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { deleteCredentials, loadCredentials } from "../core/credentials.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Revoke the stored token and remove local credentials")
    .action(async () => {
      const credentials = await loadCredentials();

      if (!credentials) {
        console.log(chalk.yellow("Not logged in."));
        return;
      }

      const config = await loadConfig();
      const serverUrl = resolveServerUrl({ config, credentials });
      const token = resolveToken(credentials) ?? credentials.token;

      // Best-effort server-side revoke: `token.revoke` needs the token id, which
      // is not stored locally, so match the stored token's 8-char prefix against
      // the listing. Any failure here (offline, already revoked) is ignored so
      // logout always clears local credentials.
      await revokeBestEffort(serverUrl, token, credentials.token);

      await deleteCredentials();
      console.log(`${chalk.green("✓")} Logged out.`);
    });
}

async function revokeBestEffort(
  serverUrl: string,
  token: string,
  storedToken: string,
): Promise<void> {
  try {
    const client = createApiClient({ serverUrl, token });
    const tokens = await client.token.list.query();
    const prefix = storedToken.slice(0, 8);
    const matches = tokens.filter((t) => t.tokenPrefix === prefix);
    // Only revoke on an unambiguous single match to avoid nuking another token
    // that happens to share the short prefix.
    if (matches.length === 1 && matches[0]) {
      await client.token.revoke.mutate({ id: matches[0].id });
    }
  } catch {
    /* best-effort: local credentials are removed regardless */
  }
}
