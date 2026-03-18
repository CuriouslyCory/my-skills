import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  createSession,
  isAuthEnabled,
  validate,
} from "@curiouslycory/auth";

import { publicProcedure } from "../trpc";

export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  isAuthEnabled: publicProcedure.query(() => {
    return isAuthEnabled();
  }),
  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isAuthEnabled()) {
        return { token: null, username: "local" };
      }

      if (!validate(input.username, input.password)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      const token = await createSession(input.username);
      return { token, username: input.username };
    }),
  logout: publicProcedure.mutation(() => {
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
