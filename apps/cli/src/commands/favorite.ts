import type { Command } from "commander";
import chalk from "chalk";

import { friendlyApiErrorMessage } from "../core/api-client.js";
import type { ApiClient } from "../core/api-client.js";
import { saveConfig } from "../core/config.js";
import type { AccountFavorite, FavoritesContext } from "../core/favorites.js";
import {
  fetchAllAccountFavorites,
  hasMergedFavorites,
  markFavoritesMerged,
  ownerRepoFromUrl,
  repoUrlFromOwnerRepo,
  resolveFavoritesContext,
} from "../core/favorites.js";

interface FavOptions {
  yes?: boolean;
}

function toRepoUrl(ownerRepo: string): string {
  return repoUrlFromOwnerRepo(ownerRepo);
}

/**
 * On the first authenticated `fav` invocation for a server, offer to merge local
 * `config.favoriteRepos` into the account. `--yes` skips the offer; declining or an
 * empty local list still records the offer as handled so it never re-prompts.
 * A network failure during the merge propagates to the caller and is NOT recorded,
 * so it can be retried.
 */
async function maybeMergeLocalFavorites(
  context: FavoritesContext,
  client: ApiClient,
  skipPrompt: boolean,
): Promise<void> {
  if (await hasMergedFavorites(context.serverUrl)) return;

  const localUrls = context.config.favoriteRepos;

  if (localUrls.length === 0) {
    await markFavoritesMerged(context.serverUrl);
    return;
  }

  if (skipPrompt) {
    // --yes skips the offer rather than silently importing local favorites.
    await markFavoritesMerged(context.serverUrl);
    return;
  }

  const { default: confirm } = await import("@inquirer/confirm");
  const doMerge = await confirm({
    message: `Merge ${localUrls.length} local favorite(s) into your account?`,
    default: true,
  });

  if (doMerge) {
    for (const url of localUrls) {
      await client.favorite.add.mutate({
        repoUrl: url,
        name: ownerRepoFromUrl(url),
        type: "repo",
      });
    }
    console.log(
      chalk.green(
        `✓ Merged ${localUrls.length} local favorite(s) into your account.`,
      ),
    );
  }

  await markFavoritesMerged(context.serverUrl);
}

function formatAddedAt(addedAt: AccountFavorite["addedAt"]): string {
  if (addedAt instanceof Date && !Number.isNaN(addedAt.getTime())) {
    return addedAt.toISOString().slice(0, 10);
  }
  return "";
}

async function cloudAdd(client: ApiClient, ownerRepo: string): Promise<void> {
  const url = toRepoUrl(ownerRepo);
  const already = await client.favorite.isFavorited.query({ repoUrl: url });

  if (already) {
    console.log(chalk.yellow(`Already favorited: ${ownerRepo}`));
    return;
  }

  await client.favorite.add.mutate({ repoUrl: url, name: ownerRepo, type: "repo" });
  console.log(`${chalk.green("✓")} Added ${chalk.bold(ownerRepo)} to favorites`);
}

async function cloudRemove(client: ApiClient, ownerRepo: string): Promise<void> {
  const url = toRepoUrl(ownerRepo);
  const favorites = await fetchAllAccountFavorites(client);
  const match = favorites.find((f) => f.type === "repo" && f.repoUrl === url);

  if (!match) {
    console.log(chalk.yellow(`Not in favorites: ${ownerRepo}`));
    return;
  }

  await client.favorite.remove.mutate({ id: match.id });
  console.log(
    `${chalk.green("✓")} Removed ${chalk.bold(ownerRepo)} from favorites`,
  );
}

async function cloudList(
  client: ApiClient,
  serverUrl: string,
): Promise<void> {
  const favorites = await fetchAllAccountFavorites(client);

  if (favorites.length === 0) {
    console.log(chalk.yellow("No favorite repos."));
    return;
  }

  console.log(chalk.bold("FAVORITE REPOS (account)"));
  for (const fav of favorites) {
    const added = formatAddedAt(fav.addedAt);
    const meta = [chalk.dim(`[${fav.type}]`), added ? chalk.dim(added) : ""]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${chalk.yellow("★")} ${fav.name}  ${meta}`);
  }
  console.log(
    `\n${chalk.dim(`${favorites.length} favorite(s) · ${serverUrl}`)}`,
  );
}

export function registerFavoriteCommand(program: Command): void {
  const favCmd = program
    .command("favorite")
    .alias("fav")
    .description("Manage favorite repos");

  favCmd
    .command("add <owner/repo>")
    .description("Add a repo to favorites")
    .option("-y, --yes", "Skip the one-time local-favorites merge prompt")
    .action(async (ownerRepo: string, opts: FavOptions) => {
      const context = await resolveFavoritesContext();

      if (!context.authed || !context.client) {
        const config = context.config;
        const url = toRepoUrl(ownerRepo);

        if (config.favoriteRepos.includes(url)) {
          console.log(chalk.yellow(`Already favorited: ${ownerRepo}`));
          return;
        }

        config.favoriteRepos.push(url);
        await saveConfig(config);
        console.log(
          `${chalk.green("✓")} Added ${chalk.bold(ownerRepo)} to favorites`,
        );
        return;
      }

      const client = context.client;
      try {
        await maybeMergeLocalFavorites(context, client, opts.yes ?? false);
        await cloudAdd(client, ownerRepo);
      } catch (error) {
        console.error(
          chalk.red(friendlyApiErrorMessage(error, context.serverUrl)),
        );
        process.exitCode = 1;
      }
    });

  favCmd
    .command("remove <owner/repo>")
    .description("Remove a repo from favorites")
    .option("-y, --yes", "Skip the one-time local-favorites merge prompt")
    .action(async (ownerRepo: string, opts: FavOptions) => {
      const context = await resolveFavoritesContext();

      if (!context.authed || !context.client) {
        const config = context.config;
        const url = toRepoUrl(ownerRepo);
        const index = config.favoriteRepos.indexOf(url);

        if (index === -1) {
          console.log(chalk.yellow(`Not in favorites: ${ownerRepo}`));
          return;
        }

        config.favoriteRepos.splice(index, 1);
        await saveConfig(config);
        console.log(
          `${chalk.green("✓")} Removed ${chalk.bold(ownerRepo)} from favorites`,
        );
        return;
      }

      const client = context.client;
      try {
        await maybeMergeLocalFavorites(context, client, opts.yes ?? false);
        await cloudRemove(client, ownerRepo);
      } catch (error) {
        console.error(
          chalk.red(friendlyApiErrorMessage(error, context.serverUrl)),
        );
        process.exitCode = 1;
      }
    });

  favCmd
    .command("list")
    .alias("ls")
    .description("List all favorite repos")
    .option("-y, --yes", "Skip the one-time local-favorites merge prompt")
    .action(async (opts: FavOptions) => {
      const context = await resolveFavoritesContext();

      if (!context.authed || !context.client) {
        const repos = context.config.favoriteRepos;

        if (repos.length === 0) {
          console.log(chalk.yellow("No favorite repos."));
          return;
        }

        console.log(chalk.bold("FAVORITE REPOS"));
        for (const url of repos) {
          const short = url
            .replace("https://github.com/", "")
            .replace(/\.git$/, "");
          console.log(`  ${chalk.yellow("★")} ${short}`);
        }
        console.log(`\n${chalk.dim(`${repos.length} repo(s)`)}`);
        return;
      }

      const client = context.client;
      try {
        await maybeMergeLocalFavorites(context, client, opts.yes ?? false);
        await cloudList(client, context.serverUrl);
      } catch (error) {
        console.error(
          chalk.red(friendlyApiErrorMessage(error, context.serverUrl)),
        );
        process.exitCode = 1;
      }
    });
}
