import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { eq, LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@curiouslycory/db";
import { db, dbDialect } from "@curiouslycory/db/client";
import { account, session, user, verification } from "@curiouslycory/db/schema";

import { authEnv } from "../env";

const env = authEnv();

/**
 * The session shape exposed to the rest of the app (tRPC context, web helpers).
 *
 * This is a structural subset of better-auth's inferred session; routers rely on
 * `session.user.id` (per US-003) plus display fields.
 */
export interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  } | null;
}

/**
 * True when GitHub OAuth credentials are configured. When true the app runs in
 * multi-user (hosted) mode and login is enforced. When false the app runs in
 * local single-user mode: a single user is auto-provisioned and no sign-in is
 * required, preserving the existing self-hosted SQLite workflow.
 */
export function isMultiUserAuthEnabled(): boolean {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;
  return (
    typeof GITHUB_CLIENT_ID === "string" &&
    GITHUB_CLIENT_ID.length > 0 &&
    typeof GITHUB_CLIENT_SECRET === "string" &&
    GITHUB_CLIENT_SECRET.length > 0
  );
}

const githubClientId = env.GITHUB_CLIENT_ID;
const githubClientSecret = env.GITHUB_CLIENT_SECRET;
const socialProviders =
  githubClientId && githubClientSecret
    ? {
        github: {
          clientId: githubClientId,
          clientSecret: githubClientSecret,
        },
      }
    : undefined;

/**
 * Well-known fallback secret, acceptable only in local single-user mode where
 * requests are attributed to the auto-provisioned local user and no signed
 * session is ever trusted.
 */
const LOCAL_DEV_AUTH_SECRET = "dev-secret-do-not-use-in-prod";

/**
 * Resolves better-auth's signing secret. Multi-user auth signs real sessions, so
 * it fails fast without `AUTH_SECRET` rather than signing with the known dev
 * value. This backs up the `authEnv()` check, which is skipped in CI/lint.
 */
function resolveAuthSecret(): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (isMultiUserAuthEnabled()) {
    throw new Error(
      "AUTH_SECRET is required when GitHub OAuth (multi-user auth) is enabled. Generate one with `openssl rand -base64 32`.",
    );
  }
  return LOCAL_DEV_AUTH_SECRET;
}

/**
 * The better-auth server instance. The drizzle adapter is pointed at the shared
 * dialect-agnostic client from `@curiouslycory/db`; `provider` is derived from
 * the active dialect so better-auth emits correct SQL on either backend.
 */
export const auth = betterAuth({
  secret: resolveAuthSecret(),
  baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: dbDialect === "postgres" ? "pg" : "sqlite",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
});

// Local single-user mode: a fixed synthetic account auto-provisioned on demand.
// The identity is shared with the db package's legacy-ownership upgrade, which
// backfills pre-ownership rows to this same user.

/**
 * Ensures the single local user exists (local mode only) and returns it.
 * Idempotent: creates the row on first call, then returns the existing row.
 */
export async function ensureLocalUser(): Promise<Session["user"]> {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, LOCAL_USER_EMAIL))
    .limit(1);

  const found = existing[0];
  if (found) {
    return {
      id: found.id,
      name: found.name,
      email: found.email,
      image: found.image,
    };
  }

  const now = new Date();
  const created = await db
    .insert(user)
    .values({
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const row = created[0];
  if (!row) {
    throw new Error("Failed to provision local user");
  }
  return { id: row.id, name: row.name, email: row.email, image: row.image };
}

/**
 * Returns the auto-provisioned local session (local mode only). Callers should
 * guard with `!isMultiUserAuthEnabled()` before using this.
 */
export async function getLocalSession(): Promise<Session> {
  const localUser = await ensureLocalUser();
  return { user: localUser, session: null };
}
