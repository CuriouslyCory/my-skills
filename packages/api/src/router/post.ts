import type { TRPCRouterRecord } from "@trpc/server";

import { desc } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";

import { publicProcedure } from "../trpc";

export const postRouter = {
  all: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.skills.findMany({
      orderBy: desc(skills.createdAt),
      limit: 10,
    });
  }),
} satisfies TRPCRouterRecord;
