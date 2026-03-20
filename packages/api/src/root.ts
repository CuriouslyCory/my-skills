import { artifactRouter } from "./router/artifact";
import { authRouter } from "./router/auth";
import { compositionRouter } from "./router/composition";
import { configRouter } from "./router/config";
import { favoriteRouter } from "./router/favorite";
import { gitRouter } from "./router/git";
import { postRouter } from "./router/post";
import { searchRouter } from "./router/search";
import { skillRouter } from "./router/skill";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  artifact: artifactRouter,
  auth: authRouter,
  composition: compositionRouter,
  config: configRouter,
  favorite: favoriteRouter,
  git: gitRouter,
  post: postRouter,
  search: searchRouter,
  skill: skillRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
