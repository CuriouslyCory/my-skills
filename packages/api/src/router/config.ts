import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@curiouslycory/db";
import { config, favorites } from "@curiouslycory/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

export const configRouter = {
  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.config.findFirst({
        where: eq(config.key, input.key),
      });
      return row ?? null;
    }),

  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(config);
  }),

  set: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.config.findFirst({
        where: eq(config.key, input.key),
      });

      if (existing) {
        await ctx.db
          .update(config)
          .set({ value: input.value })
          .where(eq(config.key, input.key));
      } else {
        await ctx.db.insert(config).values({
          key: input.key,
          value: input.value,
        });
      }

      return { key: input.key, value: input.value };
    }),

  favorites: {
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.db.select().from(favorites);
    }),

    add: protectedProcedure
      .input(
        z.object({
          repoUrl: z.string().min(1),
          name: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .insert(favorites)
          .values({
            repoUrl: input.repoUrl,
            name: input.name,
            description: input.description ?? null,
          })
          .returning();
        return row;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db.delete(favorites).where(eq(favorites.id, input.id));
        return { success: true };
      }),
  },
} satisfies TRPCRouterRecord;
