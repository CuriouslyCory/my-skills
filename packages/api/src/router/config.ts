import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq } from "@curiouslycory/db";
import { config } from "@curiouslycory/db/schema";

import { syncConfigToFile } from "../lib/config-sync";
import { protectedProcedure } from "../trpc";

export const configRouter = {
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.config.findFirst({
        where: and(
          eq(config.userId, ctx.session.user.id),
          eq(config.key, input.key),
        ),
      });
      return row ?? null;
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(config)
      .where(eq(config.userId, ctx.session.user.id));
  }),

  set: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.config.findFirst({
        where: and(eq(config.userId, userId), eq(config.key, input.key)),
      });

      if (existing) {
        await ctx.db
          .update(config)
          .set({ value: input.value })
          .where(and(eq(config.userId, userId), eq(config.key, input.key)));
      } else {
        await ctx.db.insert(config).values({
          userId,
          key: input.key,
          value: input.value,
        });
      }

      const result = { key: input.key, value: input.value };
      syncConfigToFile(ctx.db, userId).catch((err) =>
        console.error("config-sync failed:", err),
      );
      return result;
    }),
} satisfies TRPCRouterRecord;
