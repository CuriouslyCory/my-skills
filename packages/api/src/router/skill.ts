import { readdir, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";
import {
  parseSkillFrontmatter,
  buildSkillContent,
} from "@curiouslycory/shared-types";

import { protectedProcedure, publicProcedure } from "../trpc";

async function walkSkillDirs(
  baseDir: string,
): Promise<{ dirPath: string; skillMdPath: string }[]> {
  const results: { dirPath: string; skillMdPath: string }[] = [];
  if (!existsSync(baseDir)) return results;

  const entries = await readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(baseDir, entry.name);
    const skillMdPath = join(dirPath, "SKILL.md");
    if (existsSync(skillMdPath)) {
      results.push({ dirPath, skillMdPath });
    }
  }
  return results;
}

export const skillRouter = {
  list: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = input?.category
        ? await ctx.db
            .select()
            .from(skills)
            .where(eq(skills.category, input.category))
            .orderBy(desc(skills.updatedAt))
        : await ctx.db
            .select()
            .from(skills)
            .orderBy(desc(skills.updatedAt));

      if (input?.tags && input.tags.length > 0) {
        return rows.filter((row) => {
          const rowTags: string[] = JSON.parse(row.tags);
          return input.tags!.some((t) => rowTags.includes(t));
        });
      }

      return rows;
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
        tags: z.array(z.string()).optional(),
        author: z.string().optional(),
        version: z.string().optional(),
        content: z.string(),
        category: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const skillsDir = join(ctx.repoPath, "skills");
      const dirPath = join(skillsDir, input.name);

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
      const existing = await ctx.db.query.skills.findFirst({
        where: eq(skills.id, input.id),
      });
      if (!existing) {
        throw new Error(`Skill not found: ${input.id}`);
      }

      const updatedName = input.name ?? existing.name;
      const updatedDescription = input.description ?? existing.description;
      const updatedContent = input.content ?? existing.content;
      const updatedAuthor =
        input.author !== undefined ? input.author : existing.author;
      const updatedVersion =
        input.version !== undefined ? input.version : existing.version;

      // Write to disk if we have a dirPath
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
        throw new Error(`Skill not found: ${input.id}`);
      }

      // Remove from disk
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
    const skillsDir = join(ctx.repoPath, "skills");
    const found = await walkSkillDirs(skillsDir);
    let added = 0;
    let updated = 0;
    let removed = 0;

    const seenDirPaths = new Set<string>();

    for (const { dirPath, skillMdPath } of found) {
      const relDirPath = relative(ctx.repoPath, dirPath);
      seenDirPaths.add(relDirPath);

      const raw = await readFile(skillMdPath, "utf-8");
      let frontmatter;
      let body: string;
      try {
        const parsed = parseSkillFrontmatter(raw);
        frontmatter = parsed.frontmatter;
        body = parsed.body;
      } catch {
        // Skip files with invalid frontmatter
        continue;
      }

      const existing = await ctx.db.query.skills.findFirst({
        where: eq(skills.dirPath, relDirPath),
      });

      if (existing) {
        await ctx.db
          .update(skills)
          .set({
            name: frontmatter.name,
            description: frontmatter.description,
            content: body,
            tags: JSON.stringify([]),
            updatedAt: new Date(),
          })
          .where(eq(skills.id, existing.id));
        updated++;
      } else {
        await ctx.db.insert(skills).values({
          name: frontmatter.name,
          description: frontmatter.description,
          content: body,
          tags: JSON.stringify([]),
          dirPath: relDirPath,
          category: "skill",
        });
        added++;
      }
    }

    // Remove stale DB entries whose dirPath no longer exists on disk
    const allDbSkills = await ctx.db.select().from(skills);
    for (const row of allDbSkills) {
      if (row.dirPath && !seenDirPaths.has(row.dirPath)) {
        await ctx.db.delete(skills).where(eq(skills.id, row.id));
        removed++;
      }
    }

    return { added, updated, removed };
  }),
} satisfies TRPCRouterRecord;
