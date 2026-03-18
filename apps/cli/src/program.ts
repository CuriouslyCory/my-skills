import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };
import { registerAddCommand } from "./commands/add.js";
import { registerListCommand } from "./commands/list.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerCheckCommand } from "./commands/check.js";
import { registerFindCommand } from "./commands/find.js";
import { registerInitCommand } from "./commands/init.js";
import { registerUpdateCommand } from "./commands/update.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("my-skills")
    .description("AI Agent Skills Manager - install, manage, and compose skills for AI agents")
    .version(packageJson.version);

  registerAddCommand(program);
  registerCheckCommand(program);
  registerFindCommand(program);
  registerInitCommand(program);
  registerListCommand(program);
  registerRemoveCommand(program);
  registerUpdateCommand(program);

  return program;
}
