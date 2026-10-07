import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "@curiouslycory/db";
import type { Database } from "@curiouslycory/db";
import type { Session } from "@curiouslycory/auth";
import { apiTokens, user } from "@curiouslycory/db/schema";

/**
 * Personal access token auth lib (#22).
 *
 * Mints, hashes, and resolves `mysk_`-prefixed API tokens. Bearer resolution
 * reads the database directly via drizzle and only `import type`s from
 * `@curiouslycory/auth`, so the better-auth runtime is never pulled into the API
 * package or the Edge middleware (per #20). This mirrors how #28's
 * github-connector reads tokens from the DB without the better-auth runtime.
 *
 * Security: the plaintext token is returned exactly once (at creation) and never
 * persisted or logged. Only the SHA-256 hash (`token_hash`, hex) and an 8-char
 * `token_prefix` are stored. Resolution narrows candidates by prefix (indexed),
 * then compares fixed-length SHA-256 digests with `crypto.timingSafeEqual`.
 */

/** All personal access tokens carry this human-recognizable prefix. */
export const TOKEN_PREFIX = "mysk_";

/** Number of leading characters of the full token stored for display/lookup. */
export const TOKEN_PREFIX_LENGTH = 8;

/** CSPRNG entropy (bytes) appended after the prefix. */
const TOKEN_RANDOM_BYTES = 32;

/** SHA-256 hex of the given string. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** SHA-256 digest Buffer of the given string (fixed 32-byte length). */
function digestToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export interface GeneratedToken {
  /** The full plaintext token. Returned to the user exactly once. */
  token: string;
  /** SHA-256 hex of `token`, persisted in `api_tokens.token_hash`. */
  tokenHash: string;
  /** First `TOKEN_PREFIX_LENGTH` chars of `token`, persisted for display/lookup. */
  tokenPrefix: string;
}

/**
 * Generates a new personal access token using a CSPRNG. The plaintext is only
 * present in the returned object; callers persist `tokenHash` + `tokenPrefix`.
 */
export function generateToken(): GeneratedToken {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${random}`;
  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
  };
}

/**
 * Extracts a `mysk_` token from an `Authorization: Bearer <token>` header.
 * Returns null when the header is absent, not a Bearer scheme, or the credential
 * does not carry the expected token prefix.
 */
export function extractBearerToken(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (!token?.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

/**
 * Resolves an `Authorization` header to a `Session`, or null when it does not
 * carry a valid, unexpired personal access token.
 *
 * The returned session is the SAME shape a cookie session yields, so
 * `protectedProcedure` and all #21 `ctx.session.user.id` scoping behave
 * identically whether the request was authenticated by cookie or Bearer token.
 *
 * On a successful match, `last_used_at` is updated. The hash comparison is
 * constant-time via `crypto.timingSafeEqual` over equal-length SHA-256 digests.
 */
export async function resolveTokenSession(
  db: Database,
  authorizationHeader: string | null | undefined,
): Promise<Session | null> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return null;

  const incomingDigest = digestToken(token);
  const tokenPrefix = token.slice(0, TOKEN_PREFIX_LENGTH);

  const candidates = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenPrefix, tokenPrefix));

  let matched: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    const storedDigest = Buffer.from(candidate.tokenHash, "hex");
    // timingSafeEqual requires equal lengths; skip malformed rows instead of
    // throwing so a garbage hash never leaks timing or crashes resolution.
    if (storedDigest.length !== incomingDigest.length) continue;
    if (timingSafeEqual(incomingDigest, storedDigest)) {
      matched = candidate;
    }
  }

  if (!matched) return null;

  // Reject expired tokens.
  const now = new Date();
  if (matched.expiresAt && matched.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(eq(apiTokens.id, matched.id));

  const [owner] = await db
    .select()
    .from(user)
    .where(eq(user.id, matched.userId))
    .limit(1);

  if (!owner) return null;

  return {
    user: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      image: owner.image,
    },
    session: null,
  };
}
