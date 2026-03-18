import type { Command } from "commander";
import chalk from "chalk";

import { ConfigSchema } from "@curiouslycory/shared-types";
import type { Config } from "@curiouslycory/shared-types";

import { loadConfig, saveConfig, DEFAULT_CONFIG } from "../core/config.js";

type ConfigKey = keyof Config;

const CONFIG_KEYS = Object.keys(ConfigSchema.shape) as ConfigKey[];

/**
 * Get a nested value using dot-notation key.
 */
function getConfigValue(config: Config, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const ARRAY_KEYS: ReadonlySet<ConfigKey> = new Set<ConfigKey>(["defaultAgents", "favoriteRepos"]);
const BOOLEAN_KEYS: ReadonlySet<ConfigKey> = new Set<ConfigKey>(["autoDetectAgents"]);

/**
 * Parse a string value into the appropriate type for a config key.
 */
function parseConfigValue(key: ConfigKey, value: string): unknown {
  if (ARRAY_KEYS.has(key)) {
    return value.split(",").map((v) => v.trim());
  }

  if (BOOLEAN_KEYS.has(key)) {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    throw new Error(`Invalid boolean value: "${value}". Use true/false.`);
  }

  return value;
}

/**
 * Format a config value for display.
 */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? chalk.dim("[]") : value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? chalk.green("true") : chalk.red("false");
  }
  return String(value);
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Manage global configuration");

  configCmd
    .command("get <key>")
    .description("Get a config value (supports dot-notation)")
    .action(async (key: string) => {
      const config = await loadConfig();
      const value = getConfigValue(config, key);

      if (value === undefined) {
        console.log(chalk.red(`Unknown config key: ${key}`));
        console.log(`Available keys: ${CONFIG_KEYS.join(", ")}`);
        process.exitCode = 1;
        return;
      }

      console.log(formatValue(value));
    });

  configCmd
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key: string, value: string) => {
      if (!CONFIG_KEYS.includes(key as ConfigKey)) {
        console.log(chalk.red(`Unknown config key: ${key}`));
        console.log(`Available keys: ${CONFIG_KEYS.join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const config = await loadConfig();
      const parsed = parseConfigValue(key as ConfigKey, value);

      const updated = { ...config, [key]: parsed };

      // Validate the full config
      const result = ConfigSchema.safeParse(updated);
      if (!result.success) {
        console.log(chalk.red(`Invalid value for ${key}: ${result.error.issues[0]?.message}`));
        process.exitCode = 1;
        return;
      }

      await saveConfig(result.data);
      console.log(`${chalk.green("✓")} ${key} = ${formatValue(parsed)}`);
    });

  configCmd
    .command("list")
    .description("List all config values")
    .action(async () => {
      const config = await loadConfig();

      const keyWidth = Math.max(...CONFIG_KEYS.map((k) => k.length));
      console.log(chalk.bold("KEY".padEnd(keyWidth)) + "  " + chalk.bold("VALUE"));

      for (const key of CONFIG_KEYS) {
        const value = config[key];
        console.log(key.padEnd(keyWidth) + "  " + formatValue(value));
      }
    });

  configCmd
    .command("delete <key>")
    .description("Reset a config key to its default value")
    .action(async (key: string) => {
      if (!CONFIG_KEYS.includes(key as ConfigKey)) {
        console.log(chalk.red(`Unknown config key: ${key}`));
        console.log(`Available keys: ${CONFIG_KEYS.join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const config = await loadConfig();
      const defaultValue = DEFAULT_CONFIG[key as ConfigKey];
      const updated = { ...config, [key]: defaultValue };

      await saveConfig(updated);
      console.log(`${chalk.green("✓")} ${key} reset to default: ${formatValue(defaultValue)}`);
    });
}
