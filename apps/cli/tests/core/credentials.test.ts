import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as nodeOs from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testDir: string;
let credsDir: string;
let credsPath: string;
let configPath: string;

// credentials.ts computes its paths from homedir() at import time.
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof nodeOs>("node:os");
  return { ...actual, homedir: () => testDir };
});

const sample = {
  serverUrl: "https://my-skills.dev",
  token: "mysk_abc123",
  username: "alice",
};

describe("credentials", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "creds-test-"));
    credsDir = join(testDir, ".my-skills");
    credsPath = join(credsDir, "credentials.json");
    configPath = join(credsDir, "config.json");
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns null when no file exists", async () => {
    const { loadCredentials } = await import("../../src/core/credentials.js");
    expect(await loadCredentials()).toBeNull();
  });

  it("returns null for a malformed file", async () => {
    const { saveCredentials } = await import("../../src/core/credentials.js");
    await saveCredentials(sample); // ensures dir exists
    await writeFile(credsPath, "not json", "utf-8");
    const { loadCredentials } = await import("../../src/core/credentials.js");
    expect(await loadCredentials()).toBeNull();
  });

  it("round-trips the credentials shape", async () => {
    const { saveCredentials, loadCredentials } = await import(
      "../../src/core/credentials.js"
    );
    await saveCredentials(sample);
    expect(await loadCredentials()).toEqual(sample);
  });

  it("writes the file at mode 0600", async () => {
    const { saveCredentials } = await import("../../src/core/credentials.js");
    await saveCredentials(sample);
    const info = await stat(credsPath);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("never writes credentials into config.json", async () => {
    const { saveCredentials } = await import("../../src/core/credentials.js");
    await saveCredentials(sample);
    await expect(readFile(configPath, "utf-8")).rejects.toThrow();
  });

  it("deletes the credentials file and tolerates a missing file", async () => {
    const { saveCredentials, deleteCredentials } = await import(
      "../../src/core/credentials.js"
    );
    await saveCredentials(sample);
    await deleteCredentials();
    await expect(access(credsPath)).rejects.toThrow();
    // Second delete on a missing file must not throw.
    await expect(deleteCredentials()).resolves.toBeUndefined();
  });
});
