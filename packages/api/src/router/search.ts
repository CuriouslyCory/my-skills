import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, sql } from "@curiouslycory/db";
import { skills } from "@curiouslycory/db/schema";

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
    .query(async ({ ctx, input }) => {
      const { query, category, limit, offset } = input;

      // Empty query: return recent items
      if (!query || query.trim() === "") {
        const rows = category
          ? await ctx.db
              .select()
              .from(skills)
              .where(sql`${skills.category} = ${category}`)
              .orderBy(desc(skills.updatedAt))
              .limit(limit)
              .offset(offset)
          : await ctx.db
              .select()
              .from(skills)
              .orderBy(desc(skills.updatedAt))
              .limit(limit)
              .offset(offset);

        return rows.map((row) => ({ ...row, snippet: null }));
      }

      // Build FTS5 MATCH query with prefix matching
      const terms = query
        .trim()
        .split(/\s+/)
        .map((term) => `"${term.replace(/"/g, '""')}"*`)
        .join(" ");

      const categoryFilter = category
        ? sql`AND s.category = ${category}`
        : sql``;

      const results = ctx.db.all<{
        id: string;
        name: string;
        description: string;
        tags: string;
        author: string | null;
        version: string | null;
        content: string;
        dir_path: string | null;
        category: string | null;
        created_at: number;
        updated_at: number;
        snippet: string;
        rank: number;
      }>(sql`
        SELECT
          s.id, s.name, s.description, s.tags, s.author, s.version,
          s.content, s.dir_path, s.category, s.created_at, s.updated_at,
          snippet(skills_fts, -1, '<mark>', '</mark>', '...', 48) as snippet,
          rank
        FROM skills_fts
        JOIN skills s ON s.name = skills_fts.name
          AND s.description = skills_fts.description
        WHERE skills_fts MATCH ${terms}
        ${categoryFilter}
        ORDER BY rank
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      return results.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        tags: row.tags,
        author: row.author,
        version: row.version,
        content: row.content,
        dirPath: row.dir_path,
        category: row.category,
        createdAt: row.created_at ? new Date(row.created_at * 1000) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at * 1000) : null,
        snippet: row.snippet,
      }));
    }),
} satisfies TRPCRouterRecord;
