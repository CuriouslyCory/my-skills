import { describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  startCallbackServer,
} from "../../src/commands/login.js";

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

  it("rejects when the callback reports an error", async () => {
    const server = await startCallbackServer({ state: "s2", timeoutMs: 2000 });
    const assertion = expect(server.waitForCallback()).rejects.toThrow(
      /Authorization failed/i,
    );

    await fetch(`http://127.0.0.1:${server.port}/?error=access_denied&state=s2`);

    await assertion;
  });
});
