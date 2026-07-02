import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@curiouslycory/auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
