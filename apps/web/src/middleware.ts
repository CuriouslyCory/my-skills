import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { authEnv } from "@curiouslycory/auth/env";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth", "/api/trpc"];

// Multi-user detection is computed here from the edge-safe env module (no DB
// import) so the middleware stays within the Edge runtime. It mirrors
// `isMultiUserAuthEnabled()` from `@curiouslycory/auth`, which cannot be
// imported here because it transitively loads the Node-only DB client.
const env = authEnv();
const multiUserAuthEnabled =
  typeof env.GITHUB_CLIENT_ID === "string" &&
  env.GITHUB_CLIENT_ID.length > 0 &&
  typeof env.GITHUB_CLIENT_SECRET === "string" &&
  env.GITHUB_CLIENT_SECRET.length > 0;

export function middleware(request: NextRequest) {
  // Local single-user mode: no sign-in required, auto-provisioned local user.
  if (!multiUserAuthEnabled) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Presence check of the better-auth session cookie (no DB hit at the edge).
  // The session is fully validated server-side in the tRPC context / RSCs.
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
