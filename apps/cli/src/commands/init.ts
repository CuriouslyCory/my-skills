import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";

import { buildSkillContent } from "@curiouslycory/shared-types";

import { loadConfig } from "../core/config.js";

interface InitOptions {
  force?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init [name]")
    .description("Scaffold a new SKILL.md for a skill")
    .option("--force", "Overwrite existing skill")
    .action(async (name: string | undefined, opts: InitOptions) => {
      let skillName = name;
      let description = "";

      if (!skillName) {
        const { default: input } = await import("@inquirer/input");
        skillName = await input({ message: "Skill name:" });
      }

      if (!skillName.trim()) {
        console.error(chalk.red("Error: Skill name cannot be empty."));
        process.exit(1);
      }

      {
        const { default: input } = await import("@inquirer/input");
        description = await input({ message: "Skill description:" });
      }

      const config = await loadConfig();
      const skillDir = join(process.cwd(), config.skillsDir, skillName);
      const skillFile = join(skillDir, "SKILL.md");

      // Check if skill already exists
      try {
        await access(skillFile);
        if (!opts.force) {
          console.error(
            chalk.red(
              `Error: Skill "${skillName}" already exists at ${skillFile}`,
            ),
          );
          console.error(chalk.yellow("Use --force to overwrite."));
          process.exit(1);
        }
      } catch {
        // File doesn't exist, which is what we want
      }

      // Create directory
      await mkdir(skillDir, { recursive: true });

      // Generate SKILL.md content
      const content = buildSkillContent(
        { name: skillName, description: description || "A new skill" },
        "\n# " + skillName + "\n\nAdd your skill instructions here.\n",
      );

      await writeFile(skillFile, content, "utf-8");

      console.log(chalk.green(`✔ Created ${skillFile}`));
    });
}
