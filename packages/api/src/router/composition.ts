import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray } from "@curiouslycory/db";
import { compositions, skills } from "@curiouslycory/db/schema";

import { mergeFragments } from "../lib/merge";
import { protectedProcedure } from "../trpc";

export const compositionRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select()
      .from(compositions)
      .where(eq(compositions.userId, userId))
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
            .where(
              and(inArray(skills.id, fragmentIds), eq(skills.userId, userId)),
            );

          outdated = fragments.some((f) => f.updatedAt > comp.updatedAt);
        }
        return { ...comp, outdated };
      }),
    );

    return results;
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const composition = await ctx.db.query.compositions.findFirst({
        where: and(
          eq(compositions.id, input.id),
          eq(compositions.userId, userId),
        ),
      });
      if (!composition) return null;

      const fragmentIds = JSON.parse(composition.fragments) as string[];
      if (fragmentIds.length === 0) {
        return { ...composition, resolvedFragments: [] };
      }

      const fragments = await ctx.db
        .select()
        .from(skills)
        .where(and(inArray(skills.id, fragmentIds), eq(skills.userId, userId)));

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
          userId: ctx.session.user.id,
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
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.compositions.findFirst({
        where: and(
          eq(compositions.id, input.id),
          eq(compositions.userId, userId),
        ),
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
        .where(
          and(eq(compositions.id, input.id), eq(compositions.userId, userId)),
        )
        .returning();

      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.compositions.findFirst({
        where: and(
          eq(compositions.id, input.id),
          eq(compositions.userId, userId),
        ),
      });
      if (!existing) {
        throw new Error(`Composition not found: ${input.id}`);
      }

      await ctx.db
        .delete(compositions)
        .where(
          and(eq(compositions.id, input.id), eq(compositions.userId, userId)),
        );

      return { success: true };
    }),

  preview: protectedProcedure
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
        .where(
          and(
            inArray(skills.id, input.fragmentIds),
            eq(skills.userId, ctx.session.user.id),
          ),
        );

      // Order fragments according to the provided order
      const fragmentMap = new Map(fragments.map((f) => [f.id, f.content]));
      const orderedIds =
        input.order.length > 0 ? input.order : input.fragmentIds;
      const orderedContent = orderedIds
        .map((id) => fragmentMap.get(id))
        .filter((c): c is string => c !== undefined);

      return mergeFragments(orderedContent);
    }),

  exportMarkdown: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const composition = await ctx.db.query.compositions.findFirst({
        where: and(
          eq(compositions.id, input.id),
          eq(compositions.userId, userId),
        ),
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
        .where(and(inArray(skills.id, fragmentIds), eq(skills.userId, userId)));

      const fragmentMap = new Map(fragments.map((f) => [f.id, f.content]));
      const orderedIds = order.length > 0 ? order : fragmentIds;
      const orderedContent = orderedIds
        .map((id) => fragmentMap.get(id))
        .filter((c): c is string => c !== undefined);

      return mergeFragments(orderedContent);
    }),
} satisfies TRPCRouterRecord;
