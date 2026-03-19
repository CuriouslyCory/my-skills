import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq, inArray } from "@curiouslycory/db";
import { compositions, skills } from "@curiouslycory/db/schema";

import { mergeFragments } from "../lib/merge";
import { protectedProcedure, publicProcedure } from "../trpc";

export const compositionRouter = {
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(compositions)
      .orderBy(desc(compositions.updatedAt));

    // Check for outdated compositions by comparing fragment updatedAt vs composition updatedAt
    const results = await Promise.all(
      rows.map(async (comp) => {
        const fragmentIds = JSON.parse(comp.fragments) as string[];
        let outdated = false;
        if (fragmentIds.length > 0) {
          const fragments = await ctx.db
            .select({ updatedAt: skills.updatedAt })
            .from(skills)
            .where(inArray(skills.id, fragmentIds));

          outdated = fragments.some(
            (f) => f.updatedAt > comp.updatedAt,
          );
        }
        return { ...comp, outdated };
      }),
    );

    return results;
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const composition = await ctx.db.query.compositions.findFirst({
        where: eq(compositions.id, input.id),
      });
      if (!composition) return null;

      const fragmentIds = JSON.parse(composition.fragments) as string[];
      if (fragmentIds.length === 0) {
        return { ...composition, resolvedFragments: [] };
      }

      const fragments = await ctx.db
        .select()
        .from(skills)
        .where(inArray(skills.id, fragmentIds));

      // Preserve the order from the composition's fragments array
      const fragmentMap = new Map(fragments.map((f) => [f.id, f]));
      const resolvedFragments = fragmentIds
        .map((id) => fragmentMap.get(id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f));

      return { ...composition, resolvedFragments };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        fragments: z.array(z.string()),
        order: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(compositions)
        .values({
          name: input.name,
          description: input.description ?? null,
          fragments: JSON.stringify(input.fragments),
          order: JSON.stringify(input.order),
        })
        .returning();

      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        fragments: z.array(z.string()).optional(),
        order: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.compositions.findFirst({
        where: eq(compositions.id, input.id),
      });
      if (!existing) {
        throw new Error(`Composition not found: ${input.id}`);
      }

      const [row] = await ctx.db
        .update(compositions)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.fragments !== undefined
            ? { fragments: JSON.stringify(input.fragments) }
            : {}),
          ...(input.order !== undefined
            ? { order: JSON.stringify(input.order) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(compositions.id, input.id))
        .returning();

      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.compositions.findFirst({
        where: eq(compositions.id, input.id),
      });
      if (!existing) {
        throw new Error(`Composition not found: ${input.id}`);
      }

      await ctx.db.delete(compositions).where(eq(compositions.id, input.id));

      return { success: true };
    }),

  preview: publicProcedure
    .input(
      z.object({
        fragmentIds: z.array(z.string()),
        order: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.fragmentIds.length === 0) return "";

      const fragments = await ctx.db
        .select({ id: skills.id, content: skills.content })
        .from(skills)
        .where(inArray(skills.id, input.fragmentIds));

      // Order fragments according to the provided order
      const fragmentMap = new Map(fragments.map((f) => [f.id, f.content]));
      const orderedIds =
        input.order.length > 0 ? input.order : input.fragmentIds;
      const orderedContent = orderedIds
        .map((id) => fragmentMap.get(id))
        .filter((c): c is string => c !== undefined);

      return mergeFragments(orderedContent);
    }),

  exportMarkdown: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const composition = await ctx.db.query.compositions.findFirst({
        where: eq(compositions.id, input.id),
      });
      if (!composition) {
        throw new Error(`Composition not found: ${input.id}`);
      }

      const fragmentIds = JSON.parse(composition.fragments) as string[];
      const order = JSON.parse(composition.order) as string[];

      if (fragmentIds.length === 0) return "";

      const fragments = await ctx.db
        .select({ id: skills.id, content: skills.content })
        .from(skills)
        .where(inArray(skills.id, fragmentIds));

      const fragmentMap = new Map(fragments.map((f) => [f.id, f.content]));
      const orderedIds = order.length > 0 ? order : fragmentIds;
      const orderedContent = orderedIds
        .map((id) => fragmentMap.get(id))
        .filter((c): c is string => c !== undefined);

      return mergeFragments(orderedContent);
    }),
} satisfies TRPCRouterRecord;
