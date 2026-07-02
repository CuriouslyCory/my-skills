import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";

import type { Config } from "@curiouslycory/shared-types";

// TYPE-ONLY import: `AppRouter` is erased by the bundler, so no server runtime
// (better-sqlite3 / drizzle-orm / octokit / the `@curiouslycory/api` value graph)
// is pulled into the CLI bundle. Never turn this into a value import.
import type { AppRouter } from "@curiouslycory/api";

import type { Credentials } from "./credentials.js";

/** The tRPC HTTP path the web app mounts the router on. */
const TRPC_ENDPOINT = "/api/trpc";

export type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Thrown when a command needs authentication but no token is available (neither
 * `MY_SKILLS_TOKEN` nor a stored credentials file).
 */
export class AuthRequiredError extends Error {
  constructor(message = "Not logged in. Run `ms login` to authenticate.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/**
 * Resolves the server base URL. Precedence: `MY_SKILLS_SERVER_URL` env (wins, for
 * CI) > `credentials.serverUrl` (the server a stored token was minted against) >
 * `config.serverUrl` (default hosted domain).
 */
export function resolveServerUrl(opts: {
  config: Config;
  credentials?: Credentials | null;
}): string {
  const envUrl = process.env.MY_SKILLS_SERVER_URL?.trim();
  if (envUrl) return stripTrailingSlash(envUrl);
  if (opts.credentials?.serverUrl) {
    return stripTrailingSlash(opts.credentials.serverUrl);
  }
  return stripTrailingSlash(opts.config.serverUrl);
}

/**
 * Resolves the Bearer token. Precedence: `MY_SKILLS_TOKEN` env (wins, for CI) >
 * `credentials.token`. Returns null when neither is present.
 */
export function resolveToken(credentials?: Credentials | null): string | null {
  const envToken = process.env.MY_SKILLS_TOKEN?.trim();
  if (envToken) return envToken;
  return credentials?.token ?? null;
}

/**
 * Creates a typed tRPC client against the hosted `AppRouter`. When `token` is set
 * it is sent as `Authorization: Bearer <token>`; the server resolves it to a
 * session identical to a cookie session (see #22 token-auth).
 */
export function createApiClient(opts: {
  serverUrl: string;
  token?: string | null;
}): ApiClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: SuperJSON,
        url: stripTrailingSlash(opts.serverUrl) + TRPC_ENDPOINT,
        headers() {
          const headers: Record<string, string> = {
            "x-trpc-source": "cli",
          };
          if (opts.token) {
            headers.authorization = `Bearer ${opts.token}`;
          }
          return headers;
        },
      }),
    ],
  });
}

export type ApiErrorKind = "unauthorized" | "offline" | "unknown";

/**
 * Classifies an error thrown by the API client so commands can render a friendly,
 * actionable message:
 * - `unauthorized`: token revoked/expired or otherwise rejected (HTTP 401 /
 *   tRPC `UNAUTHORIZED`).
 * - `offline`: the server was unreachable (connection refused, DNS failure, or a
 *   low-level fetch failure).
 * - `unknown`: anything else.
 */
export function classifyApiError(error: unknown): ApiErrorKind {
  if (error instanceof TRPCClientError) {
    // The unbound `TRPCClientError` generic types `data`/`shape` as `any`; read
    // them through a structural view with `unknown` leaves so access stays safe.
    const view = error as {
      data?: { httpStatus?: unknown } | null;
      shape?: { data?: { code?: unknown } | null } | null;
      cause?: unknown;
    };
    const httpStatus = view.data?.httpStatus;
    const code = view.shape?.data?.code;
    if (httpStatus === 401 || code === "UNAUTHORIZED") {
      return "unauthorized";
    }
    if (isNetworkError(view.cause)) {
      return "offline";
    }
    // A TRPCClientError with no error shape usually means the request never
    // completed (network layer). Treat it as offline.
    if (!view.shape) return "offline";
    return "unknown";
  }

  if (isNetworkError(error)) return "offline";
  return "unknown";
}

/** Builds a user-facing message for an API error. */
export function friendlyApiErrorMessage(
  error: unknown,
  serverUrl: string,
): string {
  switch (classifyApiError(error)) {
    case "unauthorized":
      return "Your session has expired or the token was revoked. Run `ms login` to sign in again.";
    case "offline":
      return `Could not reach the server at ${serverUrl}. Check your connection or the configured serverUrl.`;
    default:
      return error instanceof Error ? error.message : String(error);
  }
}

/** Walks the `cause` chain looking for a low-level connection failure. */
function isNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      const code = (current as NodeJS.ErrnoException).code;
      if (
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "EAI_AGAIN" ||
        code === "ECONNRESET" ||
        code === "UND_ERR_CONNECT_TIMEOUT"
      ) {
        return true;
      }
      if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(current.message)) {
        return true;
      }
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return false;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
