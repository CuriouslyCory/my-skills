import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "../../src/core/api-client.js";
import {
  browserOpenCommand,
  buildAuthorizeUrl,
  registerLoginCommand,
  startCallbackServer,
} from "../../src/commands/login.js";

const {
  SERVER_URL,
  mockInput,
  mockSaveCredentials,
  mockGetSession,
  mockCreateApiClient,
} = vi.hoisted(() => {
    const getSession = vi.fn();
    return {
      SERVER_URL: "https://my-skills.dev",
      mockInput: vi.fn(),
      mockSaveCredentials: vi.fn(() => Promise.resolve()),
      mockGetSession: getSession,
      mockCreateApiClient: vi.fn(() => ({
        auth: { getSession: { query: getSession } },
      })),
    };
  });

vi.mock("@inquirer/input", () => ({ default: mockInput }));

vi.mock("../../src/core/credentials.js", () => ({
  saveCredentials: mockSaveCredentials,
}));

vi.mock("../../src/core/config.js", () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      defaultAgents: [],
      favoriteRepos: [],
      cacheDir: "/tmp/cache",
      skillsDir: ".agents/skills",
      autoDetectAgents: true,
      symlinkBehavior: "copy",
      serverUrl: SERVER_URL,
    }),
  ),
}));

// Keep resolveServerUrl real; stub only the network client.
vi.mock("../../src/core/api-client.js", async (importActual) => {
  const actual =
    await importActual<typeof ApiClientModule>();
  return { ...actual, createApiClient: mockCreateApiClient };
});

describe("buildAuthorizeUrl", () => {
  it("encodes callback, name and state into the /cli-auth URL", () => {
    const url = new URL(
      buildAuthorizeUrl({
        serverUrl: "https://my-skills.dev",
        callbackUrl: "http://127.0.0.1:54321",
        name: "my-laptop",
        state: "abc123",
      }),
    );
    expect(url.pathname).toBe("/cli-auth");
    expect(url.searchParams.get("callback")).toBe("http://127.0.0.1:54321");
    expect(url.searchParams.get("name")).toBe("my-laptop");
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

describe("browserOpenCommand", () => {
  const url =
    "https://my-skills.dev/cli-auth?callback=http%3A%2F%2F127.0.0.1%3A1&name=a&state=b";

  it("uses `open` on macOS and `xdg-open` elsewhere", () => {
    expect(browserOpenCommand(url, "darwin")).toEqual({
      command: "open",
      args: [url],
    });
    expect(browserOpenCommand(url, "linux")).toEqual({
      command: "xdg-open",
      args: [url],
    });
  });

  it("never routes through cmd.exe on Windows (no `&` re-parsing)", () => {
    const { command, args } = browserOpenCommand(url, "win32");
    expect(command).toBe("rundll32");
    expect(command).not.toBe("cmd");
    // The full URL, query string and all, is one argv entry.
    expect(args).toEqual(["url.dll,FileProtocolHandler", url]);
  });
});

describe("startCallbackServer", () => {
  it("resolves with the token when the callback carries a matching state", async () => {
    const server = await startCallbackServer({ state: "s1", timeoutMs: 2000 });
    // Attach the assertion (and thus a handler) before triggering the callback
    // so a fast settle never surfaces as an unhandled promise rejection.
    const assertion = expect(server.waitForCallback()).resolves.toEqual({
      token: "mysk_tok",
      username: "bob",
    });

    const res = await fetch(
      `http://127.0.0.1:${server.port}/?token=mysk_tok&username=bob&state=s1`,
    );
    expect(res.status).toBe(200);

    await assertion;
  });

  it("rejects when the returned state does not match", async () => {
    const server = await startCallbackServer({
      state: "expected",
      timeoutMs: 2000,
    });
    const assertion = expect(server.waitForCallback()).rejects.toThrow(
      /state mismatch/i,
    );

    await fetch(
      `http://127.0.0.1:${server.port}/?token=mysk_tok&username=bob&state=wrong`,
    );

    await assertion;
  });

  it("rejects when the state parameter is missing", async () => {
    const server = await startCallbackServer({ state: "s3", timeoutMs: 2000 });
    const assertion = expect(server.waitForCallback()).rejects.toThrow(
      /state mismatch/i,
    );

    const res = await fetch(`http://127.0.0.1:${server.port}/?token=mysk_tok`);
    expect(res.status).toBe(400);

    await assertion;
  });

  it("rejects when the callback reports an error", async () => {
    const server = await startCallbackServer({ state: "s2", timeoutMs: 2000 });
    const assertion = expect(server.waitForCallback()).rejects.toThrow(
      /Authorization failed/i,
    );

    await fetch(`http://127.0.0.1:${server.port}/?error=access_denied&state=s2`);

    await assertion;
  });
});

describe("ms login --no-browser (paste flow)", () => {
  const originalServerUrl = process.env.MY_SKILLS_SERVER_URL;

  function run() {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);
    return program.parseAsync(["node", "ms", "login", "--no-browser"]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MY_SKILLS_SERVER_URL;
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    if (originalServerUrl === undefined) {
      delete process.env.MY_SKILLS_SERVER_URL;
    } else {
      process.env.MY_SKILLS_SERVER_URL = originalServerUrl;
    }
  });

  it("verifies the pasted token, saves credentials and reports the user", async () => {
    mockInput.mockResolvedValue("  mysk_abcdef123456  ");
    mockGetSession.mockResolvedValue({
      user: { name: "alice", email: "alice@example.com" },
    });

    await run();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("/cli-auth?"),
    );
    expect(mockCreateApiClient).toHaveBeenCalledWith({
      serverUrl: SERVER_URL,
      token: "mysk_abcdef123456",
    });
    expect(mockSaveCredentials).toHaveBeenCalledWith({
      serverUrl: SERVER_URL,
      token: "mysk_abcdef123456",
      username: "alice",
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Logged in as"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("mysk_abc"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("falls back to the email when the user has no name", async () => {
    mockInput.mockResolvedValue("mysk_token");
    mockGetSession.mockResolvedValue({
      user: { name: "", email: "alice@example.com" },
    });

    await run();

    expect(mockSaveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice@example.com" }),
    );
  });

  it("errors without contacting the server when no token is pasted", async () => {
    mockInput.mockResolvedValue("   ");

    await run();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("No token provided"),
    );
    expect(mockCreateApiClient).not.toHaveBeenCalled();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rejects a token the server does not recognize (no session)", async () => {
    mockInput.mockResolvedValue("mysk_bogus");
    mockGetSession.mockResolvedValue(null);

    await run();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("rejected by the server"),
    );
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports a verification failure when the session lookup throws", async () => {
    mockInput.mockResolvedValue("mysk_token");
    mockGetSession.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await run();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Could not verify the token: connect ECONNREFUSED"),
    );
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
