import { artifactRouter } from "./router/artifact";
import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { searchRouter } from "./router/search";
import { skillRouter } from "./router/skill";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  artifact: artifactRouter,
  auth: authRouter,
  post: postRouter,
  search: searchRouter,
  skill: skillRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
