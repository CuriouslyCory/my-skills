import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArtifactCategory, SkillFrontmatter } from "@curiouslycory/shared-types";
import {
  ArtifactCategorySchema,
  buildSkillContent,
  DEPLOY_PATH_MAP,
} from "@curiouslycory/shared-types";

import type { ApiClient } from "../core/api-client.js";
import {
  AuthRequiredError,
  createApiClient,
  resolveServerUrl,
  resolveToken,
} from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { loadCredentials } from "../core/credentials.js";
import type { ResolvedSkill } from "../core/skill-resolver.js";
import { CLOUD_SOURCE_PREFIX } from "./source-parser.js";

/** One artifact returned by `library.get` (full content + metadata). */
export type CloudArtifact = Awaited<
  ReturnType<ApiClient["library"]["get"]["query"]>
>;
/** One row returned by `library.list` (metadata only). */
export type CloudLibraryItem = Awaited<
  ReturnType<ApiClient["library"]["list"]["query"]>
>[number];

/** A materialized cloud artifact ready to feed the existing install pipeline. */
export interface MaterializedCloudArtifact {
  resolved: ResolvedSkill;
  category: ArtifactCategory;
  /** Removes the temp directory backing `resolved.sourcePath`. */
  cleanup: () => Promise<void>;
}

/**
 * Builds an authenticated tRPC client for the personal library. Precedence for
 * the token follows #23 (`MY_SKILLS_TOKEN` env, then stored credentials). Throws
 * `AuthRequiredError` with a clear, actionable message when no token is present,
 * so unauthenticated `@me/...` usage and token-less `ms apply` fail cleanly.
 */
export async function createCloudClient(): Promise<{
  client: ApiClient;
  serverUrl: string;
}> {
  const config = await loadConfig();
  const credentials = await loadCredentials();
  const serverUrl = resolveServerUrl({ config, credentials });
  const token = resolveToken(credentials);

  if (!token) {
    throw new AuthRequiredError(
      "Not logged in. Set MY_SKILLS_TOKEN or run `ms login` to install from your personal library (@me).",
    );
  }

  return { client: createApiClient({ serverUrl, token }), serverUrl };
}

/** Lists the caller's library (metadata only). */
export function listCloudLibrary(
  client: ApiClient,
): Promise<CloudLibraryItem[]> {
  return client.library.list.query();
}

/** Fetches one artifact by name; throws when it is not in the caller's library. */
export async function fetchCloudArtifact(
  client: ApiClient,
  name: string,
): Promise<NonNullable<CloudArtifact>> {
  const artifact = await client.library.get.query({ name });
  if (!artifact) {
    throw new Error(
      `"${cloudManifestSource(name)}" was not found in your library.`,
    );
  }
  return artifact;
}

/** Coerces a DB category (possibly null) into a known ArtifactCategory. */
export function normalizeCategory(
  category: string | null | undefined,
): ArtifactCategory {
  const parsed = ArtifactCategorySchema.safeParse(category);
  return parsed.success ? parsed.data : "skill";
}

/** The deploy directory for a category (`DEPLOY_PATH_MAP`), rooted at the project. */
export function cloudDeployDir(
  projectRoot: string,
  category: ArtifactCategory,
): string {
  return join(projectRoot, DEPLOY_PATH_MAP[category]);
}

/** The manifest `source` string for a personal-library entry. */
export function cloudManifestSource(name: string): string {
  return `${CLOUD_SOURCE_PREFIX}/${name}`;
}

/**
 * Writes a cloud artifact's content to a temp `<tmp>/<name>/SKILL.md` and returns
 * a `ResolvedSkill` pointing at it, so the existing installer/adapters/hasher
 * pipeline handles cloud entries identically to github/local ones.
 * `buildSkillContent` is deterministic, so the resulting content hash is stable
 * across runs (which is what `update`/`check` compare against).
 */
export async function materializeCloudArtifact(
  artifact: NonNullable<CloudArtifact>,
): Promise<MaterializedCloudArtifact> {
  const category = normalizeCategory(artifact.category);

  const tmpRoot = await mkdtemp(join(tmpdir(), "my-skills-cloud-"));
  const skillDir = join(tmpRoot, artifact.name);
  await mkdir(skillDir, { recursive: true });

  // Reconstruct SKILL.md from the DB fields. Assigning to a const first avoids
  // excess-property checks on author/version (mirrors the API's write path).
  const frontmatter: SkillFrontmatter = {
    name: artifact.name,
    description: artifact.description,
    ...(artifact.author ? { author: artifact.author } : {}),
    ...(artifact.version ? { version: artifact.version } : {}),
  };
  const fileContent = buildSkillContent(frontmatter, artifact.content);
  await writeFile(join(skillDir, "SKILL.md"), fileContent, "utf-8");

  const resolved: ResolvedSkill = {
    name: artifact.name,
    sourcePath: skillDir,
    frontmatter: { name: artifact.name, description: artifact.description },
    content: fileContent,
    files: ["SKILL.md"],
  };

  return {
    resolved,
    category,
    cleanup: () => rm(tmpRoot, { recursive: true, force: true }),
  };
}
