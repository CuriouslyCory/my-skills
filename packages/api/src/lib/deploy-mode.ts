/**
 * Deployment mode, selected at runtime via the `DEPLOY_MODE` environment
 * variable. Mirrors the `DB_DIALECT`/`resolveDialect` pattern in `packages/db`.
 *
 * - `local` (default): the web-ui is filesystem-coupled. Skill/artifact editors
 *   write SKILL.md files to the repo, disk-sync (`scanAndSync`) and config-file
 *   sync (`syncConfigToFile`) run, and the git page is available.
 * - `hosted`: the database is the canonical store. Editors persist to the
 *   `content` column only (no filesystem writes, `dirPath` stays null), disk and
 *   config-file sync are disabled, and the git page/router are turned off.
 *
 * Read at call time (not module load) so the resolved mode always reflects the
 * current environment (this also lets tests toggle the value per case).
 */
export type DeployMode = "local" | "hosted";

/**
 * Resolves the active deploy mode from the environment, defaulting to `local`.
 * Any value other than the exact string `hosted` falls back to `local` to
 * preserve the existing self-hosted behavior.
 */
export function resolveDeployMode(
  value = process.env.DEPLOY_MODE,
): DeployMode {
  return value === "hosted" ? "hosted" : "local";
}

/** True when the app runs in local, filesystem-coupled mode (the default). */
export function isLocalMode(): boolean {
  return resolveDeployMode() === "local";
}

/** True when the app runs in hosted, database-canonical mode. */
export function isHostedMode(): boolean {
  return resolveDeployMode() === "hosted";
}
