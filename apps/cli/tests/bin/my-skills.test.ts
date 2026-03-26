import { describe, expect, it, vi, beforeEach } from "vitest";

const mockParse = vi.fn();
const mockCreateProgram = vi.fn(() => ({ parse: mockParse }));

vi.mock("../../src/program.js", () => ({
  createProgram: mockCreateProgram,
}));

describe("entry point (bin/my-skills)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls createProgram and parse", async () => {
    // Dynamic import triggers the module's side effects
    await import("../../src/bin/my-skills.js");

    expect(mockCreateProgram).toHaveBeenCalledOnce();
    expect(mockParse).toHaveBeenCalledOnce();
  });

  it("propagates errors from parse without swallowing them", async () => {
    mockParse.mockImplementation(() => {
      throw new Error("parse failed");
    });

    // Re-import won't re-execute due to module caching, so use vi.resetModules
    vi.resetModules();

    // Re-apply the mock after reset
    vi.doMock("../../src/program.js", () => ({
      createProgram: () => ({ parse: mockParse }),
    }));

    // The entry point has no try/catch, so errors propagate to the caller
    await expect(
      import("../../src/bin/my-skills.js"),
    ).rejects.toThrow("parse failed");
  });
});
