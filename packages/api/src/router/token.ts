import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq } from "@curiouslycory/db";
import { apiTokens } from "@curiouslycory/db/schema";

import { generateToken } from "../lib/token-auth";
import { protectedProcedure } from "../trpc";

/**
 * Personal access token router (#22). All procedures are `protectedProcedure`
 * and scoped to `ctx.session.user.id`. The plaintext token is returned exactly
 * once by `create`; `list` never exposes the hash or plaintext.
 */
export const tokenRouter = {
  /**
   * Mints a new token. The full plaintext is returned exactly once here and is
   * never stored or logged; only its SHA-256 hash and 8-char prefix persist.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        scopes: z.array(z.string()).optional(),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { token, tokenHash, tokenPrefix } = generateToken();

      const [row] = await ctx.db
        .insert(apiTokens)
        .values({
          userId: ctx.session.user.id,
          name: input.name,
          tokenHash,
          tokenPrefix,
          scopes: JSON.stringify(input.scopes ?? []),
          expiresAt: input.expiresAt,
        })
        .returning();

      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create token.",
        });
      }

      return {
        id: row.id,
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        scopes: parseScopes(row.scopes),
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        // Shown exactly once; the caller must copy it now.
        token,
      };
    }),

  /**
   * Lists the calling user's tokens. Returns display metadata only: never the
   * plaintext token or its hash.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, ctx.session.user.id));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      scopes: parseScopes(row.scopes),
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    }));
  }),

  /**
   * Revokes (deletes) one of the calling user's tokens. Scoped by user id so a
   * user can never revoke another user's token; throws NOT_FOUND otherwise.
   */
  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(apiTokens)
        .where(
          and(
            eq(apiTokens.id, input.id),
            eq(apiTokens.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: apiTokens.id });

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Token not found.",
        });
      }

      return { success: true };
    }),
} satisfies TRPCRouterRecord;

/** Parses the stored JSON scopes string, tolerating malformed values. */
function parseScopes(scopes: string): string[] {
  try {
    const parsed = JSON.parse(scopes) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}
