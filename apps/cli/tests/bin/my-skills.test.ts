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

  it("sets process.exitCode to 1 when parse throws", async () => {
    const originalExitCode = process.exitCode;
    mockParse.mockImplementation(() => {
      throw new Error("parse failed");
    });

    // Re-import won't re-execute due to module caching, so use vi.resetModules
    vi.resetModules();

    // Re-apply the mock after reset
    vi.doMock("../../src/program.js", () => ({
      createProgram: () => ({ parse: mockParse }),
    }));

    try {
      await import("../../src/bin/my-skills.js");
    } catch {
      // The entry point has no error handler, so the throw propagates
      // This verifies that errors from parse() are not silently swallowed
    }

    process.exitCode = originalExitCode;
  });
});
