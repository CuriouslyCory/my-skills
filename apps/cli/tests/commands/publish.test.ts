import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "@curiouslycory/shared-types";

import { registerPublishCommand } from "../../src/commands/publish.js";
import type { ApiClient } from "../../src/core/api-client.js";
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

type RunResult = Awaited<ReturnType<ApiClient["publish"]["run"]["mutate"]>>;

/** Builds a stub API client exposing only the `publish.run` call under test. */
function stubClient(run: () => Promise<RunResult>): ApiClient {
  return {
    publish: { run: { mutate: run } },
  } as unknown as ApiClient;
}

function run() {
  const program = new Command();
  program.exitOverride();
  registerPublishCommand(program);
  return program.parseAsync(["node", "ms", "publish"]);
}

describe("publish command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(config, "loadConfig").mockResolvedValue(mockConfig);
    logSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());
    errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    delete process.env.MY_SKILLS_TOKEN;
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("prints a clear login error and exits non-zero when not authenticated", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(null);
    await run();
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
  });

  it("triggers publish.run and prints the result URL", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    const mutate = vi.fn(() =>
      Promise.resolve({
        committed: true,
        unchanged: false,
        url: "https://github.com/alice/my-skills",
        commitSha: "abcdef1234567890",
        summary: "Publish 2 skills (+2 added)",
      }),
    );
    const apiClient = await import("../../src/core/api-client.js");
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(stubClient(mutate));

    await run();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("https://github.com/alice/my-skills");
  });

  it("reports 'already up to date' when nothing changed", async () => {
    vi.spyOn(credentials, "loadCredentials").mockResolvedValue(creds);
    const mutate = vi.fn(() =>
      Promise.resolve({
        committed: false,
        unchanged: true,
        url: "https://github.com/alice/my-skills",
        commitSha: "abcdef1234567890",
        summary: "Already up to date; nothing to publish.",
      }),
    );
    const apiClient = await import("../../src/core/api-client.js");
    vi.spyOn(apiClient, "createApiClient").mockReturnValue(stubClient(mutate));

    await run();

    expect(process.exitCode).toBe(0);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
