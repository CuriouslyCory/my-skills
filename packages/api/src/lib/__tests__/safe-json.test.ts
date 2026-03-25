import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeParseJsonArray } from "../safe-json.js";

describe("safeParseJsonArray", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] for null input", () => {
    expect(safeParseJsonArray(null)).toEqual([]);
  });

  it("returns the array unchanged for valid JSON array of strings", () => {
    expect(safeParseJsonArray('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("returns [] for empty array '[]'", () => {
    expect(safeParseJsonArray("[]")).toEqual([]);
  });

  it("returns [] and logs warning for invalid JSON string", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(safeParseJsonArray("not json")).toEqual([]);
    expect(warn).toHaveBeenCalledWith("safeParseJsonArray: invalid JSON input");
  });

  it("returns [] and logs warning for non-array JSON object", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(safeParseJsonArray("{}")).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "safeParseJsonArray: parsed value is not an array",
    );
  });

  it("returns [] and logs warning for non-array JSON string value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(safeParseJsonArray('"hello"')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "safeParseJsonArray: parsed value is not an array",
    );
  });

  it("returns [] and logs warning for non-array JSON number", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(safeParseJsonArray("42")).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "safeParseJsonArray: parsed value is not an array",
    );
  });

  it("filters to strings only and logs warning for mixed array", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(safeParseJsonArray('["a", 1, "b", true, "c"]')).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "safeParseJsonArray: some array elements are not strings",
    );
  });
});
