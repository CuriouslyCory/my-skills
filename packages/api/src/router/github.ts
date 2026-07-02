import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, eq } from "@curiouslycory/db";
import { account } from "@curiouslycory/db/schema";

import {
  getAuthenticatedGithubClient,
  getGithubAccount,
  GITHUB_PROVIDER_ID,
  GithubConnectorError,
  parseScopes,
  REPO_SCOPE,
} from "../lib/github-connector";
import { protectedProcedure } from "../trpc";

/**
 * Maps a connector error to a distinct, actionable tRPC error instead of a
 * generic 500. Missing connection/scope is a client-side FORBIDDEN (the user
 * must connect/grant), a revoked token is UNAUTHORIZED (the user must reconnect).
 */
function toTRPCError(err: unknown): TRPCError {
  if (err instanceof GithubConnectorError) {
    switch (err.reason) {
      case "not_connected":
      case "missing_scope":
        return new TRPCError({ code: "FORBIDDEN", message: err.message });
      case "token_revoked":
        return new TRPCError({ code: "UNAUTHORIZED", message: err.message });
    }
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected error talking to GitHub.",
  });
}

export const githubRouter = {
  /**
   * Connector status for the current user. Never throws for the not-connected
   * case; the UI uses this to decide whether to show "Connect GitHub" vs the
   * connected state.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const row = await getGithubAccount(ctx.db, ctx.session.user.id);
    const scopes = parseScopes(row?.scope);
    const hasGithubLogin = row !== null;
    const connected = Boolean(row?.accessToken) && scopes.includes(REPO_SCOPE);
    return { connected, hasGithubLogin, scopes };
  }),

  /**
   * Verifies the stored token against GitHub. Surfaces the two distinct error
   * paths (not connected / missing scope, and revoked/expired token).
   */
  verifyConnection: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { login, scopes } = await getAuthenticatedGithubClient(
        ctx.db,
        ctx.session.user.id,
      );
      return { login, scopes };
    } catch (err) {
      throw toTRPCError(err);
    }
  }),

  /**
   * Disconnects the connector by forgetting the stored publish token/scopes on
   * the user's GitHub account row (userId-scoped). The row is kept so GitHub
   * sign-in still works and the user is never locked out. The grant on GitHub's
   * side is not revoked (see plans/28.md Risks).
   */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(account)
      .set({
        accessToken: null,
        refreshToken: null,
        scope: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      })
      .where(
        and(
          eq(account.userId, ctx.session.user.id),
          eq(account.providerId, GITHUB_PROVIDER_ID),
        ),
      );
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
