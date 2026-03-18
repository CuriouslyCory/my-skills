import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };

export function createProgram(): Command {
  const program = new Command();

  program
    .name("my-skills")
    .description("AI Agent Skills Manager - install, manage, and compose skills for AI agents")
    .version(packageJson.version);

  return program;
}
