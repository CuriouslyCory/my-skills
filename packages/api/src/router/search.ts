import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { searchSkills } from "@curiouslycory/db";

import { publicProcedure } from "../trpc";

export const searchRouter = {
  query: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      }),
    )
    .query(async ({ ctx, input }) => searchSkills(ctx.db, input)),
} satisfies TRPCRouterRecord;
