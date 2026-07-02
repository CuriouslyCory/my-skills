import { artifactRouter } from "./router/artifact";
import { authRouter } from "./router/auth";
import { compositionRouter } from "./router/composition";
import { configRouter } from "./router/config";
import { favoriteRouter } from "./router/favorite";
import { githubRouter } from "./router/github";
import { gitRouter } from "./router/git";
import { libraryRouter } from "./router/library";
import { postRouter } from "./router/post";
import { searchRouter } from "./router/search";
import { skillRouter } from "./router/skill";
import { tokenRouter } from "./router/token";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  artifact: artifactRouter,
  auth: authRouter,
  composition: compositionRouter,
  config: configRouter,
  favorite: favoriteRouter,
  git: gitRouter,
  github: githubRouter,
  library: libraryRouter,
  post: postRouter,
  search: searchRouter,
  skill: skillRouter,
  token: tokenRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
