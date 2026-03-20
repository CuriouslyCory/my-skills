import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, asc, desc, eq, isNull, like, or, sql } from "@curiouslycory/db";
import { favorites } from "@curiouslycory/db/schema";

import { syncConfigToFile } from "../lib/config-sync";
import { protectedProcedure, publicProcedure } from "../trpc";

export const favoriteRouter = {
  add: protectedProcedure
    .input(
      z.object({
        repoUrl: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        skillName: z.string().optional(),
        type: z.enum(["repo", "skill"]).default("repo"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Explicit existence check due to SQLite NULL handling in composite unique constraints
      const existing = await ctx.db.query.favorites.findFirst({
        where: input.skillName
          ? and(
              eq(favorites.repoUrl, input.repoUrl),
              eq(favorites.skillName, input.skillName),
            )
          : and(
              eq(favorites.repoUrl, input.repoUrl),
              isNull(favorites.skillName),
            ),
      });

      if (existing) {
        return existing;
      }

      const [row] = await ctx.db
        .insert(favorites)
        .values({
          repoUrl: input.repoUrl,
          name: input.name,
          description: input.description ?? null,
          skillName: input.skillName ?? null,
          type: input.type,
        })
        .returning();

      syncConfigToFile(ctx.db).catch((err) =>
        console.error("config-sync failed:", err),
      );

      return row;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(favorites).where(eq(favorites.id, input.id));
      syncConfigToFile(ctx.db).catch((err) =>
        console.error("config-sync failed:", err),
      );
      return { success: true };
    }),

  toggle: protectedProcedure
    .input(
      z.object({
        repoUrl: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        skillName: z.string().optional(),
        type: z.enum(["repo", "skill"]).default("repo"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.favorites.findFirst({
        where: input.skillName
          ? and(
              eq(favorites.repoUrl, input.repoUrl),
              eq(favorites.skillName, input.skillName),
            )
          : and(
              eq(favorites.repoUrl, input.repoUrl),
              isNull(favorites.skillName),
            ),
      });

      if (existing) {
        await ctx.db.delete(favorites).where(eq(favorites.id, existing.id));
        syncConfigToFile(ctx.db).catch((err) =>
          console.error("config-sync failed:", err),
        );
        return { favorited: false };
      }

      await ctx.db
        .insert(favorites)
        .values({
          repoUrl: input.repoUrl,
          name: input.name,
          description: input.description ?? null,
          skillName: input.skillName ?? null,
          type: input.type,
        })
        .returning();

      syncConfigToFile(ctx.db).catch((err) =>
        console.error("config-sync failed:", err),
      );

      return { favorited: true };
    }),

  isFavorited: publicProcedure
    .input(
      z.object({
        repoUrl: z.string().min(1),
        skillName: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.favorites.findFirst({
        where: input.skillName
          ? and(
              eq(favorites.repoUrl, input.repoUrl),
              eq(favorites.skillName, input.skillName),
            )
          : and(
              eq(favorites.repoUrl, input.repoUrl),
              isNull(favorites.skillName),
            ),
      });

      return !!existing;
    }),

  list: publicProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional().default(1),
          pageSize: z.number().int().min(1).max(100).optional().default(30),
          search: z.string().optional(),
          sortBy: z.enum(["name", "type", "addedAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional(),
          type: z.enum(["repo", "skill"]).optional(),
        })
        .optional()
        .default({ page: 1, pageSize: 30 }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, search, sortBy, sortOrder, type } = input;

      const conditions = [];

      if (type) {
        conditions.push(eq(favorites.type, type));
      }

      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(favorites.name, pattern),
            like(favorites.repoUrl, pattern),
            like(favorites.skillName, pattern),
          ),
        );
      }

      const where =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(favorites)
        .where(where);

      const totalCount = countResult?.count ?? 0;

      // Determine sort column and direction
      const sortColumn =
        sortBy === "name"
          ? favorites.name
          : sortBy === "type"
            ? favorites.type
            : favorites.addedAt;

      const orderFn = sortOrder === "asc" ? asc : desc;

      const items = await ctx.db
        .select()
        .from(favorites)
        .where(where)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { items, totalCount };
    }),

  stats: publicProcedure.query(async ({ ctx }) => {
    // Total count
    const [totalResult] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(favorites);
    const total = totalResult?.count ?? 0;

    // Count by type
    const [repoResult] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(favorites)
      .where(eq(favorites.type, "repo"));
    const repoCount = repoResult?.count ?? 0;

    const [skillResult] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(favorites)
      .where(eq(favorites.type, "skill"));
    const skillCount = skillResult?.count ?? 0;

    // Most recent
    const [mostRecent] = await ctx.db
      .select()
      .from(favorites)
      .orderBy(desc(favorites.addedAt))
      .limit(1);

    // Top repos: repos with the most skill-level favorites
    const topRepos = await ctx.db
      .select({
        repoUrl: favorites.repoUrl,
        name: favorites.name,
        count: sql<number>`count(*)`,
      })
      .from(favorites)
      .where(eq(favorites.type, "skill"))
      .groupBy(favorites.repoUrl)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    return {
      total,
      repoCount,
      skillCount,
      mostRecent: mostRecent ?? null,
      topRepos,
    };
  }),
} satisfies TRPCRouterRecord;
