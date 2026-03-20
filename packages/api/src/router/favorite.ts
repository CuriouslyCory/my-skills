import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, isNull } from "@curiouslycory/db";
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

  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(favorites);
  }),
} satisfies TRPCRouterRecord;
