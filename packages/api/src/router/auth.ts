import type { TRPCRouterRecord } from "@trpc/server";

import { publicProcedure } from "../trpc";

/**
 * Auth router. Sign-in/sign-up/sign-out are handled by the better-auth client
 * against the `/api/auth/*` route handler, so this router only exposes a read
 * helper for the current session. (Multi-user mode detection is read directly
 * server-side via `isMultiUserAuthEnabled()` in the web app; it is intentionally
 * not surfaced here to keep the better-auth runtime out of the API graph.)
 */
export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
} satisfies TRPCRouterRecord;
