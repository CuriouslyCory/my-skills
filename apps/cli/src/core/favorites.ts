import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import chalk from "chalk";

import type { Config } from "@curiouslycory/shared-types";

import type { ApiClient } from "./api-client.js";
import type { GitHubSource } from "../services/source-parser.js";
import {
  createApiClient,
  friendlyApiErrorMessage,
  resolveServerUrl,
  resolveToken,
} from "./api-client.js";
import { loadConfig, saveConfig } from "./config.js";
import type { Credentials } from "./credentials.js";
import { loadCredentials } from "./credentials.js";

/**
 * Cloud-backed favorites (#24).
 *
 * Favorites have two sources: the hosted account (when authenticated, via the
 * `favorite` tRPC router) and the local `config.favoriteRepos` (unauthenticated).
 * This module centralizes the auth-vs-local decision so `fav`, `find`, and
 * `add --favorite` all read from — and write to — the same place.
 */

const FAVORITES_MERGE_DIR = join(homedir(), ".my-skills");
const FAVORITES_MERGE_PATH = join(FAVORITES_MERGE_DIR, "favorites-merge.json");

/** A single account favorite row as returned by the `favorite.list` tRPC query. */
export type AccountFavorite = Awaited<
  ReturnType<ApiClient["favorite"]["list"]["query"]>
>["items"][number];

export interface FavoritesContext {
  /** True when a token resolves (credentials file or `MY_SKILLS_TOKEN`). */
  authed: boolean;
  config: Config;
  credentials: Credentials | null;
  /** The server favorites would be read from / written to. */
  serverUrl: string;
  /** Typed tRPC client; present only when `authed` is true. */
  client: ApiClient | null;
}

/**
 * Resolves whether favorites should be backed by the hosted account or the local
 * config, and builds the tRPC client when authenticated. "Authenticated" means a
 * token resolves from the credentials file or `MY_SKILLS_TOKEN` (see #23).
 */
export async function resolveFavoritesContext(): Promise<FavoritesContext> {
  const config = await loadConfig();
  const credentials = await loadCredentials();
  const serverUrl = resolveServerUrl({ config, credentials });
  const token = resolveToken(credentials);

  if (!token) {
    return { authed: false, config, credentials, serverUrl, client: null };
  }

  return {
    authed: true,
    config,
    credentials,
    serverUrl,
    client: createApiClient({ serverUrl, token }),
  };
}

/** GitHub `https://github.com/<owner>/<repo>.git` URL for an `owner/repo` string. */
export function repoUrlFromOwnerRepo(ownerRepo: string): string {
  return `https://github.com/${ownerRepo}.git`;
}

/** Short `owner/repo` label for a favorite repo URL. */
export function ownerRepoFromUrl(url: string): string {
  return url.replace("https://github.com/", "").replace(/\.git$/, "");
}

/**
 * Fetches every account favorite by walking the paginated `favorite.list` query.
 * The router caps `pageSize` at 100, so large libraries are gathered page by page.
 */
export async function fetchAllAccountFavorites(
  client: ApiClient,
): Promise<AccountFavorite[]> {
  const pageSize = 100;
  const all: AccountFavorite[] = [];

  for (let page = 1; ; page += 1) {
    const { items, totalCount } = await client.favorite.list.query({
      page,
      pageSize,
    });
    all.push(...items);
    if (items.length === 0 || all.length >= totalCount) break;
  }

  return all;
}

/**
 * The single source of truth for `find` and `add --favorite`: authed callers get
 * the account's repo favorites, unauthenticated callers get `config.favoriteRepos`.
 *
 * Rejects (rather than falling back to local) on a network/auth failure while
 * authenticated so callers surface a clear error instead of silently diverging.
 */
export async function resolveFavoriteRepoUrls(
  ctx?: FavoritesContext,
): Promise<string[]> {
  const context = ctx ?? (await resolveFavoritesContext());

  if (!context.authed || !context.client) {
    return context.config.favoriteRepos;
  }

  const favorites = await fetchAllAccountFavorites(context.client);
  return favorites.filter((f) => f.type === "repo").map((f) => f.repoUrl);
}

/**
 * Adds a repo to favorites from the active source. Authed -> `favorite.add`
 * (idempotent). Unauthed -> the local `config.favoriteRepos` push (byte-for-byte
 * with the original `add --favorite` behavior). Shared so `add --favorite` writes
 * to the same store `fav` reads from.
 */
export async function addRepoFavorite(
  githubSource: GitHubSource,
  config: Config,
): Promise<void> {
  const label = `${githubSource.owner}/${githubSource.repo}`;
  const credentials = await loadCredentials();
  const serverUrl = resolveServerUrl({ config, credentials });
  const token = resolveToken(credentials);

  if (token) {
    const client = createApiClient({ serverUrl, token });
    try {
      const already = await client.favorite.isFavorited.query({
        repoUrl: githubSource.url,
      });
      if (already) return;
      await client.favorite.add.mutate({
        repoUrl: githubSource.url,
        name: label,
        type: "repo",
      });
      console.log(chalk.yellow(`★ Added ${label} to favorites`));
    } catch (error) {
      console.error(chalk.red(friendlyApiErrorMessage(error, serverUrl)));
      process.exitCode = 1;
    }
    return;
  }

  // Unauthenticated: local behavior unchanged.
  if (!config.favoriteRepos.includes(githubSource.url)) {
    config.favoriteRepos.push(githubSource.url);
    await saveConfig(config);
    console.log(chalk.yellow(`★ Added ${label} to favorites`));
  }
}

/** Reads the set of server URLs whose local->account merge has been handled. */
async function readMergedServers(): Promise<string[]> {
  try {
    const content = await readFile(FAVORITES_MERGE_PATH, "utf-8");
    const parsed = JSON.parse(content) as { mergedServers?: unknown };
    if (Array.isArray(parsed.mergedServers)) {
      return parsed.mergedServers.filter(
        (s): s is string => typeof s === "string",
      );
    }
  } catch {
    // Absent or malformed -> treat as "not yet merged" for any server.
  }
  return [];
}

/** True when the one-time merge offer has already been handled for `serverUrl`. */
export async function hasMergedFavorites(serverUrl: string): Promise<boolean> {
  const servers = await readMergedServers();
  return servers.includes(serverUrl);
}

/** Records that the merge offer has been handled for `serverUrl` (idempotent). */
export async function markFavoritesMerged(serverUrl: string): Promise<void> {
  const servers = await readMergedServers();
  if (servers.includes(serverUrl)) return;
  servers.push(serverUrl);

  await mkdir(FAVORITES_MERGE_DIR, { recursive: true });
  const tmpPath = FAVORITES_MERGE_PATH + ".tmp";
  await writeFile(
    tmpPath,
    JSON.stringify({ mergedServers: servers }, null, 2) + "\n",
    "utf-8",
  );
  await rename(tmpPath, FAVORITES_MERGE_PATH);
}
