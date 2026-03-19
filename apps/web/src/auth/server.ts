import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { isAuthEnabled, verifySession } from "@curiouslycory/auth";

import type { Session } from "@curiouslycory/auth";

const SESSION_COOKIE = "my-skills-session";

export const getSession = cache(async (): Promise<Session | null> => {
  if (!isAuthEnabled()) {
    return { user: { username: "local" } };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return verifySession(token);
});
