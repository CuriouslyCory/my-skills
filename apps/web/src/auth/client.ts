import { createAuthClient } from "better-auth/react";

/**
 * Browser-side better-auth client. Talks to the `/api/auth/*` route handler on
 * the same origin, so no explicit baseURL is needed.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
