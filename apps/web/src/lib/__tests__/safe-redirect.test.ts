import { describe, expect, it } from "vitest";

import { safeRedirect } from "~/lib/safe-redirect";

describe("safeRedirect", () => {
  it("honors root-relative in-app paths", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/skills")).toBe("/skills");
    expect(
      safeRedirect("/cli-auth?callback=http%3A%2F%2F127.0.0.1%3A5000"),
    ).toBe("/cli-auth?callback=http%3A%2F%2F127.0.0.1%3A5000");
    expect(safeRedirect("/settings#tokens")).toBe("/settings#tokens");
  });

  it("uses the first value of a repeated param", () => {
    expect(safeRedirect(["/skills", "//evil.com"])).toBe("/skills");
    expect(safeRedirect(["//evil.com", "/skills"])).toBe("/");
  });

  it("falls back to / for missing or empty values", () => {
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect([])).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
    expect(safeRedirect("skills")).toBe("/");
  });

  it("rejects backslash tricks that parse as off-site URLs", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("/\\/evil.com")).toBe("/");
    expect(safeRedirect("/skills\\..\\")).toBe("/");
  });

  it("rejects control characters and whitespace the URL parser strips", () => {
    expect(safeRedirect("/\t/evil.com")).toBe("/");
    expect(safeRedirect("/\n/evil.com")).toBe("/");
    expect(safeRedirect("/\r/evil.com")).toBe("/");
    expect(safeRedirect("/ /evil.com")).toBe("/");
    expect(safeRedirect("/\u0000evil")).toBe("/");
    expect(safeRedirect("/\u007fevil")).toBe("/");
  });
});
