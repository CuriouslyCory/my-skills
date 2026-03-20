import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@curiouslycory/db";
import { config } from "@curiouslycory/db/schema";

import { syncConfigToFile } from "../lib/config-sync";
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

      const result = { key: input.key, value: input.value };
      syncConfigToFile(ctx.db).catch((err) =>
        console.error("config-sync failed:", err),
      );
      return result;
    }),
} satisfies TRPCRouterRecord;
