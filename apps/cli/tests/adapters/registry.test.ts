import { describe, expect, it } from "vitest";
import { AgentIdSchema } from "@curiouslycory/shared-types";
import type { AgentId } from "@curiouslycory/shared-types";

import {
  adapterRegistry,
  getAdapter,
  getEnabledAdapters,
} from "../../src/adapters/registry.js";
import { SymlinkAdapter } from "../../src/adapters/symlink.js";
import { CopilotAdapter } from "../../src/adapters/copilot.js";
import { CodexAdapter } from "../../src/adapters/codex.js";
import { GeminiAdapter } from "../../src/adapters/gemini.js";

// ── SYMLINK_AGENTS constant ────────────────────────────────────────────

describe("SYMLINK_AGENTS", () => {
  const expectedSymlinkAgents: AgentId[] = [
    "claude-code",
    "cursor",
    "cline",
    "warp",
    "amp",
    "opencode",
    "kimi-code",
  ];

  it("contains exactly 7 expected agent IDs", () => {
    const symlinkAgents = AgentIdSchema.options.filter((id) => {
      const adapter = adapterRegistry.get(id);
      return adapter instanceof SymlinkAdapter;
    });
    expect(symlinkAgents).toHaveLength(7);
    expect(symlinkAgents.sort()).toEqual(expectedSymlinkAgents.sort());
  });
});

// ── adapterRegistry ────────────────────────────────────────────────────

describe("adapterRegistry", () => {
  it("has an adapter registered for every AgentIdSchema option", () => {
    for (const id of AgentIdSchema.options) {
      expect(adapterRegistry.has(id)).toBe(true);
    }
  });

  it.each([
    "claude-code",
    "cursor",
    "cline",
    "warp",
    "amp",
    "opencode",
    "kimi-code",
  ] as AgentId[])(
    "assigns SymlinkAdapter for %s",
    (id) => {
      expect(adapterRegistry.get(id)).toBeInstanceOf(SymlinkAdapter);
    },
  );

  it("assigns CopilotAdapter for github-copilot", () => {
    expect(adapterRegistry.get("github-copilot")).toBeInstanceOf(
      CopilotAdapter,
    );
  });

  it("assigns CodexAdapter for codex", () => {
    expect(adapterRegistry.get("codex")).toBeInstanceOf(CodexAdapter);
  });

  it("assigns GeminiAdapter for gemini-cli", () => {
    expect(adapterRegistry.get("gemini-cli")).toBeInstanceOf(GeminiAdapter);
  });
});

// ── getAdapter ──────────────────────────────────────────────────────────

describe("getAdapter", () => {
  it.each(AgentIdSchema.options)(
    "returns an adapter for %s",
    (id) => {
      const adapter = getAdapter(id);
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe(id);
    },
  );

  it("throws descriptive error for invalid ID", () => {
    expect(() => getAdapter("nonexistent" as AgentId)).toThrow(
      /no adapter registered for agent/i,
    );
  });
});

// ── getEnabledAdapters ──────────────────────────────────────────────────

describe("getEnabledAdapters", () => {
  it("returns correct adapters for a given agent ID list", () => {
    const adapters = getEnabledAdapters(["claude-code", "codex", "gemini-cli"]);
    expect(adapters).toHaveLength(3);
    expect(adapters[0]).toBeInstanceOf(SymlinkAdapter);
    expect(adapters[1]).toBeInstanceOf(CodexAdapter);
    expect(adapters[2]).toBeInstanceOf(GeminiAdapter);
  });

  it("returns empty array for empty input", () => {
    expect(getEnabledAdapters([])).toEqual([]);
  });

  it("throws when list contains invalid ID", () => {
    expect(() =>
      getEnabledAdapters(["claude-code", "bogus" as AgentId]),
    ).toThrow(/no adapter registered for agent/i);
  });
});
