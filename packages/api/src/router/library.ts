import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";

import { protectedProcedure } from "../trpc";

/**
 * Personal library router (#25).
 *
 * Serves the authenticated user's own artifacts (skills/agents/prompts/claudemds)
 * to the CLI so `ms add @me/<name>` (and `ms apply`/`update`/`check` for cloud
 * entries) can install them. Every procedure is `protectedProcedure` and scoped
 * to `ctx.session.user.id`, so a caller only ever sees their own rows (#21).
 *
 * Content is stored in the `content` column (hosted mode is database-canonical,
 * #22/#26), so `get` returns it directly rather than reading the filesystem.
 */
export const libraryRouter = {
  // Browse metadata for the caller's library (no content, for pickers/lists).
  list: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = input?.category
        ? await ctx.db
            .select()
            .from(skills)
            .where(
              and(eq(skills.userId, userId), eq(skills.category, input.category)),
            )
            .orderBy(desc(skills.updatedAt))
        : await ctx.db
            .select()
            .from(skills)
            .where(eq(skills.userId, userId))
            .orderBy(desc(skills.updatedAt));

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category ?? "skill",
        tags: JSON.parse(row.tags) as string[],
        author: row.author,
        version: row.version,
        updatedAt: row.updatedAt,
      }));
    }),

  // Full content + metadata for one artifact, looked up by its per-user-unique
  // name. Returns null when the caller has no such artifact.
  get: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.skills.findFirst({
        where: and(
          eq(skills.name, input.name),
          eq(skills.userId, ctx.session.user.id),
        ),
      });
      if (!row) return null;

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category ?? "skill",
        content: row.content,
        author: row.author,
        version: row.version,
        tags: JSON.parse(row.tags) as string[],
        updatedAt: row.updatedAt,
      };
    }),
} satisfies TRPCRouterRecord;
