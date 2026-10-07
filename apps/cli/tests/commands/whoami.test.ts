import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerWhoamiCommand } from "../../src/commands/whoami.js";
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
  token: "mysk_tokenabc",
  username: "alice",
};

type SessionResult = Awaited<
  ReturnType<ApiClient["auth"]["getSession"]["query"]>
>;

/** Builds a stub API client exposing only the `auth.getSession` call under test. */
function stubClient(getSession: () => Promise<SessionResult>): ApiClient {
  return {
    auth: { getSession: { query: getSession } },
  } as unknown as ApiClient;
}

function run() {
  const program = new Command();
  program.exitOverride();
  registerWhoamiCommand(program);
  return program.parseAsync(["node", "ms", "whoami"]);
}

describe("whoami command", () => {
  beforeEach(() => {
    vi.spyOn(config, "loadConfig").mockResolvedValue(mockConfig);
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    delete process.env.MY_SKILLS_TOKEN;
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("exits non-zero and reports when not logged in", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(null);

    await run();

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Not logged in"),
    );
  });

  it("prints username and token prefix when authenticated", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(
      stubClient(() =>
        Promise.resolve({
          user: {
            id: "u1",
            name: "Alice",
            email: "alice@example.com",
            image: null,
          },
          session: null,
        }),
      ),
    );

    await run();

    expect(process.exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Alice"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("mysk_tok"),
    );
  });

  it("exits non-zero when the token is no longer valid", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(
      stubClient(() => Promise.resolve(null)),
    );

    await run();

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("revoked"),
    );
  });
});
