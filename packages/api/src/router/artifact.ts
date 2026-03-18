import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";
import { CATEGORY_DIR_MAP, buildSkillContent } from "@curiouslycory/shared-types";

import { scanAndSync } from "../lib/disk-sync";
import { protectedProcedure, publicProcedure } from "../trpc";

// Artifact categories (excluding "skill" which has its own router)
const artifactCategorySchema = z.enum(["agent", "prompt", "claudemd"]);
type ArtifactCategory = z.infer<typeof artifactCategorySchema>;

function getArtifactDir(repoPath: string, category: ArtifactCategory): string {
  return join(repoPath, "artifacts", CATEGORY_DIR_MAP[category]);
}

export const artifactRouter = {
  list: publicProcedure
    .input(
      z
        .object({
          category: artifactCategorySchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.category) {
        return ctx.db
          .select()
          .from(skills)
          .where(eq(skills.category, input.category))
          .orderBy(desc(skills.updatedAt));
      }
      // Return all non-skill artifacts
      const allRows = await ctx.db
        .select()
        .from(skills)
        .orderBy(desc(skills.updatedAt));
      return allRows.filter(
        (row) =>
          row.category === "agent" ||
          row.category === "prompt" ||
          row.category === "claudemd",
      );
    }),

  listByCategory: publicProcedure
    .input(z.object({ category: artifactCategorySchema }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(skills)
        .where(eq(skills.category, input.category))
        .orderBy(desc(skills.updatedAt));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.skills.findFirst({
        where: eq(skills.id, input.id),
      });
      return row ?? null;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        category: artifactCategorySchema,
        tags: z.array(z.string()).optional(),
        author: z.string().optional(),
        version: z.string().optional(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const artifactDir = getArtifactDir(ctx.repoPath, input.category);
      const dirPath = join(artifactDir, input.name);

      await mkdir(dirPath, { recursive: true });

      const frontmatter = {
        name: input.name,
        description: input.description,
        ...(input.author ? { author: input.author } : {}),
        ...(input.version ? { version: input.version } : {}),
      };

      const fileContent = buildSkillContent(frontmatter, input.content);
      await writeFile(join(dirPath, "SKILL.md"), fileContent, "utf-8");

      const [row] = await ctx.db
        .insert(skills)
        .values({
          name: input.name,
          description: input.description,
          tags: JSON.stringify(input.tags ?? []),
          author: input.author ?? null,
          version: input.version ?? null,
          content: input.content,
          dirPath: relative(ctx.repoPath, dirPath),
          category: input.category,
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
        category: artifactCategorySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.skills.findFirst({
        where: eq(skills.id, input.id),
      });
      if (!existing) {
        throw new Error(`Artifact not found: ${input.id}`);
      }

      const updatedName = input.name ?? existing.name;
      const updatedDescription = input.description ?? existing.description;
      const updatedContent = input.content ?? existing.content;
      const updatedAuthor =
        input.author !== undefined ? input.author : existing.author;
      const updatedVersion =
        input.version !== undefined ? input.version : existing.version;

      if (existing.dirPath) {
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
        .where(eq(skills.id, input.id))
        .returning();

      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.skills.findFirst({
        where: eq(skills.id, input.id),
      });
      if (!existing) {
        throw new Error(`Artifact not found: ${input.id}`);
      }

      if (existing.dirPath) {
        const dirPath = join(ctx.repoPath, existing.dirPath);
        if (existsSync(dirPath)) {
          await rm(dirPath, { recursive: true, force: true });
        }
      }

      await ctx.db.delete(skills).where(eq(skills.id, input.id));

      return { success: true };
    }),

  syncFromDisk: protectedProcedure.mutation(async ({ ctx }) => {
    return scanAndSync(ctx.repoPath, ctx.db);
  }),
} satisfies TRPCRouterRecord;
