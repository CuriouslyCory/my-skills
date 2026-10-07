import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

/**
 * CLI credentials store (#23).
 *
 * Authentication material lives here, NEVER in `config.json`. The file is written
 * at mode 0600 (owner read/write only) so a personal access token is not readable
 * by other users on a shared machine. `serverUrl` records which server the token
 * was minted against, so an authenticated client can prefer it over the config
 * default.
 */

const CREDENTIALS_DIR = join(homedir(), ".my-skills");
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "credentials.json");

/** Owner read/write only. */
const CREDENTIALS_MODE = 0o600;

export const CredentialsSchema = z.object({
  serverUrl: z.string().url(),
  token: z.string().min(1),
  username: z.string(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

/**
 * Loads stored credentials, or null when the file is absent or malformed. A
 * malformed file is treated as "not logged in" rather than an error so commands
 * degrade gracefully.
 */
export async function loadCredentials(): Promise<Credentials | null> {
  let raw: unknown;

  try {
    const content = await readFile(CREDENTIALS_PATH, "utf-8");
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  const parsed = CredentialsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Persists credentials at mode 0600. Written to a temp file (created 0600) then
 * atomically renamed, and chmod-ed afterwards to defeat a permissive umask.
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true });

  const tmpPath = CREDENTIALS_PATH + ".tmp";
  await writeFile(
    tmpPath,
    JSON.stringify(credentials, null, 2) + "\n",
    { encoding: "utf-8", mode: CREDENTIALS_MODE },
  );
  await rename(tmpPath, CREDENTIALS_PATH);
  // Guarantee the mode even if the file already existed or umask interfered.
  await chmod(CREDENTIALS_PATH, CREDENTIALS_MODE);
}

/** Deletes the credentials file. Missing file is not an error. */
export async function deleteCredentials(): Promise<void> {
  try {
    await unlink(CREDENTIALS_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export { CREDENTIALS_DIR, CREDENTIALS_PATH };
