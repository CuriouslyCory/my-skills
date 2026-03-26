import { jwtVerify, SignJWT } from "jose";

import { authEnv } from "../env";

const env = authEnv();

export interface Session {
  user: {
    username: string;
  };
}

/**
 * Returns true only when ADMIN_USER env var is set.
 * When auth is disabled, all requests are treated as authenticated.
 */
export function isAuthEnabled(): boolean {
  return !!env.ADMIN_USER;
}

/**
 * Validates username and password against ADMIN_USER and ADMIN_PASSWORD env vars.
 */
export function validate(username: string, password: string): boolean {
  return (
    username === env.ADMIN_USER &&
    password === env.ADMIN_PASSWORD
  );
}

function getSecret(): Uint8Array {
  const secret = env.AUTH_SECRET ?? "dev-secret-do-not-use-in-prod";
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed JWT for the given username.
 */
export async function createSession(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/**
 * Verifies a JWT token and returns the decoded session or null.
 */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.username !== "string") return null;
    return { user: { username: payload.username } };
  } catch {
    return null;
  }
}
