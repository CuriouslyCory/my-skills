import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import type { Session } from "@curiouslycory/auth";
import {
  auth,
  getLocalSession,
  isMultiUserAuthEnabled,
} from "@curiouslycory/auth";

/**
 * Resolves the current session.
 *
 * - Local single-user mode (no OAuth env): returns the auto-provisioned local
 *   user without any sign-in, preserving the existing self-hosted workflow.
 * - Multi-user mode: resolves the better-auth session from the request cookies.
 *   A transient auth/DB failure is logged and treated as signed-out (`null`)
 *   rather than crashing every page render that resolves the session.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isMultiUserAuthEnabled()) {
    return getLocalSession();
  }

  // Read outside the try: `headers()` signals dynamic rendering by throwing,
  // and Next.js needs that to propagate.
  const requestHeaders = await headers();
  const result = await auth.api
    .getSession({ headers: requestHeaders })
    .catch((error: unknown) => {
      console.error("getSession: failed to resolve the auth session", error);
      return null;
    });
  if (!result) return null;

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      image: result.user.image,
    },
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
    },
  };
});
