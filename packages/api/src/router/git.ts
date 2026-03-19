import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { GitService } from "@curiouslycory/git-service";

import { protectedProcedure, publicProcedure } from "../trpc";

export const gitRouter = {
  status: publicProcedure.query(async ({ ctx }) => {
    const git = new GitService(ctx.repoPath);
    const status = await git.status();
    return {
      current: status.current,
      isClean: status.isClean(),
      files: status.files.map((f) => ({
        path: f.path,
        index: f.index,
        workingDir: f.working_dir,
      })),
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed.map((r) => ({ from: r.from, to: r.to })),
    };
  }),

  log: publicProcedure
    .input(
      z
        .object({
          path: z.string().optional(),
          maxCount: z.number().int().min(1).max(100).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const git = new GitService(ctx.repoPath);
      const limit = input?.maxCount ?? 20;
      const offset = input?.offset ?? 0;
      const result = await git.log(input?.path, limit + offset);
      const commits = result.all.slice(offset, offset + limit).map((c) => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
      return { commits, total: result.total };
    }),

  diff: publicProcedure
    .input(
      z.object({
        commit: z.string().optional(),
        path: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const git = new GitService(ctx.repoPath);
      if (input.commit) {
        // Diff for a specific commit (commit vs its parent)
        const diffText = await git.diff(
          input.path,
          `${input.commit}~1`,
          input.commit,
        );
        return { diff: diffText };
      }
      // Working tree diff
      const diffText = await git.diff(input.path);
      return { diff: diffText };
    }),

  commit: protectedProcedure
    .input(
      z.object({
        files: z.array(z.string()).min(1),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const git = new GitService(ctx.repoPath);
      const commitHash = await git.commit(input.files, input.message);
      return { hash: commitHash };
    }),

  push: protectedProcedure.mutation(async ({ ctx }) => {
    const git = new GitService(ctx.repoPath);
    await git.push();
    return { success: true };
  }),

  pull: protectedProcedure.mutation(async ({ ctx }) => {
    const git = new GitService(ctx.repoPath);
    await git.pull();
    return { success: true };
  }),

  fetch: protectedProcedure.mutation(async ({ ctx }) => {
    const git = new GitService(ctx.repoPath);
    await git.fetch();
    return { success: true };
  }),

  branches: publicProcedure.query(async ({ ctx }) => {
    const git = new GitService(ctx.repoPath);
    const result = await git.branches();
    return {
      current: result.current,
      all: result.all,
      branches: Object.entries(result.branches).map(([name, info]) => ({
        name,
        current: info.current,
        commit: info.commit,
        label: info.label,
      })),
    };
  }),

  checkout: protectedProcedure
    .input(z.object({ branch: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const git = new GitService(ctx.repoPath);
      await git.checkout(input.branch);
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
