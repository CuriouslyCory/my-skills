import type { Command } from "commander";
import chalk from "chalk";

import { loadConfig, saveConfig } from "../core/config.js";

function toRepoUrl(ownerRepo: string): string {
  return `https://github.com/${ownerRepo}.git`;
}

export function registerFavoriteCommand(program: Command): void {
  const favCmd = program
    .command("favorite")
    .alias("fav")
    .description("Manage favorite repos");

  favCmd
    .command("add <owner/repo>")
    .description("Add a repo to favorites")
    .action(async (ownerRepo: string) => {
      const config = await loadConfig();
      const url = toRepoUrl(ownerRepo);

      if (config.favoriteRepos.includes(url)) {
        console.log(chalk.yellow(`Already favorited: ${ownerRepo}`));
        return;
      }

      config.favoriteRepos.push(url);
      await saveConfig(config);
      console.log(`${chalk.green("✓")} Added ${chalk.bold(ownerRepo)} to favorites`);
    });

  favCmd
    .command("remove <owner/repo>")
    .description("Remove a repo from favorites")
    .action(async (ownerRepo: string) => {
      const config = await loadConfig();
      const url = toRepoUrl(ownerRepo);
      const index = config.favoriteRepos.indexOf(url);

      if (index === -1) {
        console.log(chalk.yellow(`Not in favorites: ${ownerRepo}`));
        return;
      }

      config.favoriteRepos.splice(index, 1);
      await saveConfig(config);
      console.log(`${chalk.green("✓")} Removed ${chalk.bold(ownerRepo)} from favorites`);
    });

  favCmd
    .command("list")
    .alias("ls")
    .description("List all favorite repos")
    .action(async () => {
      const config = await loadConfig();
      const repos = config.favoriteRepos;

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
    });
}
