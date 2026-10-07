import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerLogoutCommand } from "../../src/commands/logout.js";
import type { ApiClient } from "../../src/core/api-client.js";
import * as apiClient from "../../src/core/api-client.js";
import * as config from "../../src/core/config.js";
import * as credentials from "../../src/core/credentials.js";

const mockConfig: Config = {
  defaultAgents: [],
  favoriteRepos: [],
  cacheDir: "/tmp/cache",
  skillsDir: ".agents/skills",
  autoDetectAgents: true,
  symlinkBehavior: "copy",
  serverUrl: "https://my-skills.dev",
};

const creds = {
  serverUrl: "https://my-skills.dev",
  token: "mysk_abc123def",
  username: "alice",
};

type TokenList = Awaited<ReturnType<ApiClient["token"]["list"]["query"]>>;

function stubClient(opts: {
  list: () => Promise<TokenList>;
  revoke: ReturnType<typeof vi.fn>;
}): ApiClient {
  return {
    token: {
      list: { query: opts.list },
      revoke: { mutate: opts.revoke },
    },
  } as unknown as ApiClient;
}

function run() {
  const program = new Command();
  program.exitOverride();
  registerLogoutCommand(program);
  return program.parseAsync(["node", "ms", "logout"]);
}

describe("logout command", () => {
  beforeEach(() => {
    vi.spyOn(config, "loadConfig").mockResolvedValue(mockConfig);
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    delete process.env.MY_SKILLS_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports when not logged in and does not delete", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(null);
    const del = vi.spyOn(credentials, "deleteCredentials").mockResolvedValue();

    await run();

    expect(del).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Not logged in"),
    );
  });

  it("revokes the matching token and deletes credentials", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    const del = vi.spyOn(credentials, "deleteCredentials").mockResolvedValue();
    const revoke = vi.fn(() => Promise.resolve({ success: true }));
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(
      stubClient({
        list: () =>
          Promise.resolve([
            {
              id: "tok-1",
              name: "my-laptop",
              tokenPrefix: creds.token.slice(0, 8),
              scopes: [],
              lastUsedAt: null,
              expiresAt: null,
              createdAt: new Date(),
            },
          ]),
        revoke,
      }),
    );

    await run();

    expect(revoke).toHaveBeenCalledWith({ id: "tok-1" });
    expect(del).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Logged out"),
    );
  });

  it("still deletes credentials when the server is unreachable", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    const del = vi.spyOn(credentials, "deleteCredentials").mockResolvedValue();
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(
      stubClient({
        list: () => Promise.reject(new Error("offline")),
        revoke: vi.fn(),
      }),
    );

    await run();

    expect(del).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Logged out"),
    );
  });
});
