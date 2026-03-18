import { z } from "zod";

// ── Artifact Categories ─────────────────────────────────────────────

export const ArtifactCategorySchema = z.enum([
  "skill",
  "agent",
  "prompt",
  "claudemd",
]);
export type ArtifactCategory = z.infer<typeof ArtifactCategorySchema>;

// ── Agent IDs ───────────────────────────────────────────────────────

export const AgentIdSchema = z.enum([
  "claude-code",
  "cursor",
  "cline",
  "warp",
  "amp",
  "opencode",
  "github-copilot",
  "codex",
  "gemini-cli",
  "kimi-code",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

// ── Skill Frontmatter ───────────────────────────────────────────────

export const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  license: z.string().optional(),
  compatibility: z.array(AgentIdSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

// ── Skill Entry (manifest entry for an installed skill) ─────────────

export const SourceTypeSchema = z.enum(["github", "gitlab", "url", "local"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SkillEntrySchema = z.object({
  source: z.string(),
  sourceType: SourceTypeSchema,
  computedHash: z.string(),
  version: z.string().optional(),
  installedAt: z.string(),
  agents: z.array(AgentIdSchema).optional(),
  variations: z.record(z.string(), z.unknown()).optional(),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

// ── Manifest ────────────────────────────────────────────────────────

export const ManifestSchema = z.object({
  version: z.literal(1),
  agents: z.array(z.string()),
  skills: z.record(z.string(), SkillEntrySchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ── Config ──────────────────────────────────────────────────────────

export const ConfigSchema = z.object({
  defaultAgents: z.array(AgentIdSchema),
  favoriteRepos: z.array(z.string()),
  cacheDir: z.string(),
  skillsDir: z.string(),
  autoDetectAgents: z.boolean(),
  symlinkBehavior: z.enum(["copy", "symlink"]),
});
export type Config = z.infer<typeof ConfigSchema>;

// ── Directory Maps ──────────────────────────────────────────────────

export const CATEGORY_DIR_MAP: Record<ArtifactCategory, string> = {
  skill: "skills",
  agent: "agents",
  prompt: "prompts",
  claudemd: "claudemds",
} as const;

export const DEPLOY_PATH_MAP: Record<ArtifactCategory, string> = {
  skill: ".agents/skills",
  agent: ".agents/agents",
  prompt: ".agents/prompts",
  claudemd: ".",
} as const;

// ── Agent Native Support ────────────────────────────────────────────

export const AGENT_NATIVE_SUPPORT: Record<AgentId, boolean> = {
  "claude-code": true,
  cline: true,
  cursor: true,
  warp: true,
  amp: true,
  opencode: true,
  "github-copilot": false,
  codex: false,
  "gemini-cli": false,
  "kimi-code": false,
} as const;
