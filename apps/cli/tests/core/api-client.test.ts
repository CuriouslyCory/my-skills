import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import {
  classifyApiError,
  friendlyApiErrorMessage,
  resolveServerUrl,
  resolveToken,
} from "../../src/core/api-client.js";
import type { Credentials } from "../../src/core/credentials.js";

const baseConfig: Config = {
  defaultAgents: [],
  favoriteRepos: [],
  cacheDir: "/tmp/cache",
  skillsDir: ".agents/skills",
  autoDetectAgents: true,
  symlinkBehavior: "copy",
  serverUrl: "https://config.example",
};

const credentials: Credentials = {
  serverUrl: "https://creds.example",
  token: "mysk_credtoken",
  username: "alice",
};

describe("resolveServerUrl", () => {
  beforeEach(() => {
    delete process.env.MY_SKILLS_SERVER_URL;
  });
  afterEach(() => {
    delete process.env.MY_SKILLS_SERVER_URL;
  });

  it("prefers the env var over everything", () => {
    process.env.MY_SKILLS_SERVER_URL = "https://env.example/";
    expect(
      resolveServerUrl({ config: baseConfig, credentials }),
    ).toBe("https://env.example");
  });

  it("prefers credentials over config when no env var", () => {
    expect(resolveServerUrl({ config: baseConfig, credentials })).toBe(
      "https://creds.example",
    );
  });

  it("falls back to config when no credentials", () => {
    expect(resolveServerUrl({ config: baseConfig })).toBe(
      "https://config.example",
    );
  });
});

describe("resolveToken", () => {
  beforeEach(() => {
    delete process.env.MY_SKILLS_TOKEN;
  });
  afterEach(() => {
    delete process.env.MY_SKILLS_TOKEN;
  });

  it("prefers the env var over credentials", () => {
    process.env.MY_SKILLS_TOKEN = "mysk_envtoken";
    expect(resolveToken(credentials)).toBe("mysk_envtoken");
  });

  it("uses the credentials token otherwise", () => {
    expect(resolveToken(credentials)).toBe("mysk_credtoken");
  });

  it("returns null when neither is present", () => {
    expect(resolveToken(null)).toBeNull();
  });
});

describe("classifyApiError", () => {
  it("classifies a 401 tRPC error as unauthorized", () => {
    const error = new TRPCClientError("Unauthorized", {
      result: {
        error: {
          message: "Unauthorized",
          code: -32001,
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      },
    });
    expect(classifyApiError(error)).toBe("unauthorized");
  });

  it("classifies a connection-refused fetch failure as offline", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const error = new TRPCClientError("fetch failed", { cause });
    expect(classifyApiError(error)).toBe("offline");
  });

  it("classifies a raw network error as offline", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    expect(classifyApiError(cause)).toBe("offline");
  });

  it("classifies an unrelated error as unknown", () => {
    expect(classifyApiError(new Error("boom"))).toBe("unknown");
  });
});

describe("friendlyApiErrorMessage", () => {
  it("mentions re-login for unauthorized", () => {
    const error = new TRPCClientError("Unauthorized", {
      result: {
        error: {
          message: "Unauthorized",
          code: -32001,
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      },
    });
    expect(friendlyApiErrorMessage(error, "https://x")).toMatch(/ms login/);
  });

  it("mentions the server URL for offline", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const error = new TRPCClientError("fetch failed", { cause });
    expect(friendlyApiErrorMessage(error, "https://srv.example")).toContain(
      "https://srv.example",
    );
  });
});
