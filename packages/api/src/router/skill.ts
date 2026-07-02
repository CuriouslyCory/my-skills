import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";
import { buildSkillContent } from "@curiouslycory/shared-types";

import { isLocalMode } from "../lib/deploy-mode";
import { scanAndSync } from "../lib/disk-sync";
import { protectedProcedure } from "../trpc";

export const skillRouter = {
  list: protectedProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
    )
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

      if (input?.tags && input.tags.length > 0) {
        const tags = input.tags;
        return rows.filter((row) => {
          const rowTags = JSON.parse(row.tags) as string[];
          return tags.some((t) => rowTags.includes(t));
        });
      }

      return rows;
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.skills.findFirst({
        where: and(
          eq(skills.id, input.id),
          eq(skills.userId, ctx.session.user.id),
        ),
      });
      return row ?? null;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        tags: z.array(z.string()).optional(),
        author: z.string().optional(),
        version: z.string().optional(),
        content: z.string(),
        category: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // In hosted mode the database is canonical: content lives in the `content`
      // column and no SKILL.md is written, so `dirPath` stays null. In local mode
      // we mirror the skill to disk and record its repo-relative `dirPath`.
      let dirPath: string | null = null;
      if (isLocalMode()) {
        const skillsDir = join(ctx.repoPath, "skills");
        const absDirPath = join(skillsDir, input.name);

        await mkdir(absDirPath, { recursive: true });

        const frontmatter = {
          name: input.name,
          description: input.description,
          ...(input.author ? { author: input.author } : {}),
          ...(input.version ? { version: input.version } : {}),
        };

        const fileContent = buildSkillContent(frontmatter, input.content);
        await writeFile(join(absDirPath, "SKILL.md"), fileContent, "utf-8");

        dirPath = relative(ctx.repoPath, absDirPath);
      }

      const [row] = await ctx.db
        .insert(skills)
        .values({
          userId: ctx.session.user.id,
          name: input.name,
          description: input.description,
          tags: JSON.stringify(input.tags ?? []),
          author: input.author ?? null,
          version: input.version ?? null,
          content: input.content,
          dirPath,
          category: input.category ?? "skill",
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
        tags: z.array(z.string()).optional(),
        author: z.string().optional(),
        version: z.string().optional(),
        content: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.skills.findFirst({
        where: and(eq(skills.id, input.id), eq(skills.userId, userId)),
      });
      if (!existing) {
        throw new Error(`Skill not found: ${input.id}`);
      }

      const updatedName = input.name ?? existing.name;
      const updatedDescription = input.description ?? existing.description;
      const updatedContent = input.content ?? existing.content;
      const updatedAuthor = input.author ?? existing.author;
      const updatedVersion = input.version ?? existing.version;

      // Write to disk only in local mode and when the row is disk-backed.
      // Hosted rows have a null dirPath, so this is skipped there.
      if (isLocalMode() && existing.dirPath) {
        const dirPath = join(ctx.repoPath, existing.dirPath);
        const frontmatter = {
          name: updatedName,
          description: updatedDescription,
          ...(updatedAuthor ? { author: updatedAuthor } : {}),
          ...(updatedVersion ? { version: updatedVersion } : {}),
        };
        const fileContent = buildSkillContent(frontmatter, updatedContent);
        await writeFile(join(dirPath, "SKILL.md"), fileContent, "utf-8");
      }

      const [row] = await ctx.db
        .update(skills)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.tags !== undefined
            ? { tags: JSON.stringify(input.tags) }
            : {}),
          ...(input.author !== undefined ? { author: input.author } : {}),
          ...(input.version !== undefined ? { version: input.version } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(skills.id, input.id), eq(skills.userId, userId)))
        .returning();

      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.skills.findFirst({
        where: and(eq(skills.id, input.id), eq(skills.userId, userId)),
      });
      if (!existing) {
        throw new Error(`Skill not found: ${input.id}`);
      }

      // Remove from disk only in local mode and when the row is disk-backed.
      if (isLocalMode() && existing.dirPath) {
        const dirPath = join(ctx.repoPath, existing.dirPath);
        if (existsSync(dirPath)) {
          await rm(dirPath, { recursive: true, force: true });
        }
      }

      await ctx.db
        .delete(skills)
        .where(and(eq(skills.id, input.id), eq(skills.userId, userId)));

      return { success: true };
    }),

  syncFromDisk: protectedProcedure.mutation(async ({ ctx }) => {
    // Disk sync is a local-mode-only concern. In hosted mode the database is
    // canonical, so there is nothing to scan; return an empty result.
    if (!isLocalMode()) {
      return { added: 0, updated: 0, removed: 0 };
    }
    return scanAndSync(ctx.repoPath, ctx.db, ctx.session.user.id);
  }),
} satisfies TRPCRouterRecord;
