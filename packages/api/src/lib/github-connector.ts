import { Octokit } from "octokit";

import { and, eq } from "@curiouslycory/db";
import type { Database } from "@curiouslycory/db";
import { account } from "@curiouslycory/db/schema";

/**
 * GitHub connector lib.
 *
 * Resolves an authenticated Octokit client for the current user from the token
 * stored on their better-auth `account` row (provider `github`). It reads the
 * token directly from the database via drizzle so it never imports the
 * better-auth runtime, keeping the API package Edge/import-safe (per #20).
 *
 * The connector reuses the better-auth `account` row (accessToken + scope) as
 * its per-user state; there is no separate connector table.
 */

/** better-auth provider id for GitHub. */
export const GITHUB_PROVIDER_ID = "github";

/** OAuth scope required to publish a repository on the user's behalf. */
export const REPO_SCOPE = "repo";

/**
 * Distinct, actionable failure reasons the connector can surface. Callers (the
 * tRPC router) map these to specific error codes/messages instead of a generic
 * 500 so the UI can tell the user exactly what to do.
 */
export type GithubConnectorErrorReason =
  | "not_connected"
  | "missing_scope"
  | "token_revoked";

/** Error thrown by the connector, tagged with a machine-readable `reason`. */
export class GithubConnectorError extends Error {
  readonly reason: GithubConnectorErrorReason;

  constructor(reason: GithubConnectorErrorReason, message: string) {
    super(message);
    this.name = "GithubConnectorError";
    this.reason = reason;
  }
}

/**
 * Parses GitHub's stored scope string into a list. GitHub returns space- or
 * comma-separated scopes; better-auth persists the raw string on `account.scope`.
 */
export function parseScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Returns the user's GitHub `account` row, or null if they never linked it. */
export async function getGithubAccount(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GITHUB_PROVIDER_ID),
      ),
    )
    .limit(1);

  return row ?? null;
}

export interface GithubConnection {
  accessToken: string;
  scopes: string[];
}

/**
 * Resolves the stored GitHub connection for a user.
 *
 * Throws `not_connected` when there is no linked GitHub account (or no stored
 * token, e.g. after disconnect), and `missing_scope` when the account is linked
 * but the `repo` scope was never granted (base sign-in only).
 */
export async function resolveGithubConnection(
  db: Database,
  userId: string,
): Promise<GithubConnection> {
  const row = await getGithubAccount(db, userId);

  if (!row?.accessToken) {
    throw new GithubConnectorError(
      "not_connected",
      "GitHub is not connected. Connect it in Settings > Connectors.",
    );
  }

  const scopes = parseScopes(row.scope);
  if (!scopes.includes(REPO_SCOPE)) {
    throw new GithubConnectorError(
      "missing_scope",
      "GitHub is connected but the 'repo' scope was not granted. Reconnect GitHub to grant repo access.",
    );
  }

  return { accessToken: row.accessToken, scopes };
}

/** Injectable Octokit factory so tests can supply a mock client. */
export type OctokitFactory = (accessToken: string) => Octokit;

const defaultOctokitFactory: OctokitFactory = (accessToken) =>
  new Octokit({ auth: accessToken });

export interface GithubClientDeps {
  createOctokit?: OctokitFactory;
}

/** Builds an Octokit client authenticated with the given token. */
export function createGithubClient(
  accessToken: string,
  deps: GithubClientDeps = {},
): Octokit {
  const factory = deps.createOctokit ?? defaultOctokitFactory;
  return factory(accessToken);
}

/**
 * Verifies the token is still valid on GitHub's side by making a lightweight
 * authenticated request. A 401 means the user revoked or the token expired on
 * GitHub, which is surfaced as `token_revoked` (distinct from never-connected).
 */
export async function assertGithubTokenValid(
  octokit: Octokit,
): Promise<{ login: string }> {
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return { login: data.login };
  } catch (err) {
    if (isUnauthorized(err)) {
      throw new GithubConnectorError(
        "token_revoked",
        "The GitHub token is no longer valid (revoked or expired). Reconnect GitHub.",
      );
    }
    throw err;
  }
}

/**
 * One-call entry point: resolves the stored connection, builds the client, and
 * verifies the token is live. Returns the authenticated client plus the GitHub
 * login and granted scopes. This is what the publish feature (#29) consumes.
 */
export async function getAuthenticatedGithubClient(
  db: Database,
  userId: string,
  deps: GithubClientDeps = {},
): Promise<{ octokit: Octokit; login: string; scopes: string[] }> {
  const { accessToken, scopes } = await resolveGithubConnection(db, userId);
  const octokit = createGithubClient(accessToken, deps);
  const { login } = await assertGithubTokenValid(octokit);
  return { octokit, login, scopes };
}

/** Narrows an unknown thrown value to an HTTP 401 (Octokit RequestError). */
function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 401
  );
}
