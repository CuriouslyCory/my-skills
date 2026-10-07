import { describe, expect, it } from "vitest";

import {
  buildCallbackRedirect,
  buildCancelRedirect,
  isLoopbackCallback,
} from "~/lib/cli-auth";

describe("isLoopbackCallback", () => {
  it("accepts loopback http hosts", () => {
    expect(isLoopbackCallback("http://127.0.0.1:54321")).toBe(true);
    expect(isLoopbackCallback("http://localhost:8080/")).toBe(true);
    expect(isLoopbackCallback("http://[::1]:9000")).toBe(true);
  });

  it("rejects non-loopback and non-http callbacks", () => {
    expect(isLoopbackCallback("http://evil.example/steal")).toBe(false);
    expect(isLoopbackCallback("https://127.0.0.1")).toBe(false);
    expect(isLoopbackCallback("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLoopbackCallback("not a url")).toBe(false);
    expect(isLoopbackCallback("")).toBe(false);
  });
});

describe("callback redirect builders", () => {
  it("appends token, username and state to the callback", () => {
    const url = new URL(
      buildCallbackRedirect({
        callback: "http://127.0.0.1:5000",
        token: "mysk_tok",
        username: "alice",
        state: "s1",
      }),
    );
    expect(url.searchParams.get("token")).toBe("mysk_tok");
    expect(url.searchParams.get("username")).toBe("alice");
    expect(url.searchParams.get("state")).toBe("s1");
  });

  it("appends an access_denied error on cancel", () => {
    const url = new URL(
      buildCancelRedirect({ callback: "http://127.0.0.1:5000", state: "s1" }),
    );
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("s1");
  });
});
