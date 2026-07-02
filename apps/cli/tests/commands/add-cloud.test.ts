import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "@curiouslycory/shared-types";

import { AuthRequiredError } from "../../src/core/api-client.js";
import { addFromCloud } from "../../src/commands/add-cloud.js";
import { saveManifest } from "../../src/core/manifest.js";
import { installSkill } from "../../src/core/skill-installer.js";
import {
  createCloudClient,
  fetchCloudArtifact,
  listCloudLibrary,
} from "../../src/services/cloud-source.js";

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock("../../src/core/manifest.js", () => ({
  addSkill: vi.fn(
    (m: Manifest, name: string, entry: Manifest["skills"][string]) => ({
      ...m,
      skills: { ...m.skills, [name]: entry },
    }),
  ),
  getSkill: vi.fn((m: Manifest, name: string) => m.skills[name]),
  saveManifest: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/core/skill-installer.js", () => ({
  installSkill: vi.fn(() => Promise.resolve("cloudhash000")),
}));

vi.mock("../../src/adapters/index.js", () => ({
  getEnabledAdapters: vi.fn(() => []),
  resolveAgents: vi.fn(() => Promise.resolve(["claude-code"])),
}));

const cleanup = vi.fn(() => Promise.resolve());

vi.mock("../../src/services/cloud-source.js", () => ({
  createCloudClient: vi.fn(() =>
    Promise.resolve({ client: {}, serverUrl: "https://srv.example" }),
  ),
  listCloudLibrary: vi.fn(() =>
    Promise.resolve([
      { name: "my-agent", description: "an agent", category: "agent" },
      { name: "my-skill", description: "a skill", category: "skill" },
    ]),
  ),
  fetchCloudArtifact: vi.fn((_client: unknown, name: string) =>
    Promise.resolve({
      id: "id-1",
      name,
      description: "desc",
      category: name === "my-agent" ? "agent" : "skill",
      content: "body",
      author: null,
      version: null,
      tags: [],
      updatedAt: new Date(),
    }),
  ),
  materializeCloudArtifact: vi.fn((artifact: { name: string; category: string }) =>
    Promise.resolve({
      resolved: {
        name: artifact.name,
        sourcePath: `/tmp/${artifact.name}`,
        frontmatter: { name: artifact.name, description: "desc" },
        content: "body",
        files: ["SKILL.md"],
      },
      category: artifact.category,
      cleanup,
    }),
  ),
  cloudDeployDir: vi.fn(
    (root: string, category: string) => `${root}/.agents/${category}s`,
  ),
  cloudManifestSource: vi.fn((name: string) => `@me/${name}`),
}));

const checkboxMock = vi.fn<(opts: unknown) => Promise<string[]>>();
vi.mock("@inquirer/checkbox", () => ({
  default: (opts: unknown) => checkboxMock(opts),
}));

function makeManifest(skills: Manifest["skills"] = {}): Manifest {
  return { version: 1, agents: [], skills };
}

describe("addFromCloud", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("installs @me/<name> via the pipeline with a cloud manifest entry + hash", async () => {
    await addFromCloud(
      { type: "cloud", name: "my-agent" },
      {},
      "/proj",
      makeManifest(),
      ["claude-code"],
    );

    expect(fetchCloudArtifact).toHaveBeenCalledWith({}, "my-agent");
    // Installed into the agent DEPLOY_PATH_MAP target, not the skills dir.
    expect(installSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-agent" }),
      "/proj/.agents/agents",
    );

    const saved = vi.mocked(saveManifest).mock.calls[0]?.[1];
    const entry = saved?.skills["my-agent"];
    expect(entry?.sourceType).toBe("cloud");
    expect(entry?.source).toBe("@me/my-agent");
    expect(entry?.category).toBe("agent");
    expect(entry?.computedHash).toBe("cloudhash000");
    // Temp materialization is always cleaned up.
    expect(cleanup).toHaveBeenCalled();
  });

  it("gives a clear 'run ms login' error when unauthenticated", async () => {
    vi.mocked(createCloudClient).mockRejectedValueOnce(
      new AuthRequiredError(),
    );

    await addFromCloud(
      { type: "cloud", name: "my-agent" },
      {},
      "/proj",
      makeManifest(),
      ["claude-code"],
    );

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ms login"),
    );
    expect(installSkill).not.toHaveBeenCalled();
  });

  it("browses the library interactively for bare @me", async () => {
    checkboxMock.mockResolvedValueOnce(["my-skill"]);

    await addFromCloud(
      { type: "cloud", name: undefined },
      {},
      "/proj",
      makeManifest(),
      ["claude-code"],
    );

    expect(checkboxMock).toHaveBeenCalled();
    expect(fetchCloudArtifact).toHaveBeenCalledWith({}, "my-skill");
    expect(installSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-skill" }),
      "/proj/.agents/skills",
    );
  });

  it("--list prints the library without installing", async () => {
    await addFromCloud(
      { type: "cloud", name: undefined },
      { list: true },
      "/proj",
      makeManifest(),
      ["claude-code"],
    );

    expect(installSkill).not.toHaveBeenCalled();
    expect(listCloudLibrary).toHaveBeenCalled();
  });

  it("skips an already-installed artifact", async () => {
    const manifest = makeManifest({
      "my-agent": {
        source: "@me/my-agent",
        sourceType: "cloud",
        category: "agent",
        computedHash: "existing",
        installedAt: new Date().toISOString(),
      },
    });

    await addFromCloud(
      { type: "cloud", name: "my-agent" },
      {},
      "/proj",
      manifest,
      ["claude-code"],
    );

    expect(installSkill).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("already installed"),
    );
  });
});
