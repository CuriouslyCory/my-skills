import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };
import { registerAddCommand } from "./commands/add.js";
import { registerRemoveCommand } from "./commands/remove.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("my-skills")
    .description("AI Agent Skills Manager - install, manage, and compose skills for AI agents")
    .version(packageJson.version);

  registerAddCommand(program);
  registerRemoveCommand(program);

  return program;
}
