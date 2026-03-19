import matter from "gray-matter";
import { z } from "zod";

// ── Agent IDs ───────────────────────────────────────────────────────
// Defined here to avoid circular dependency with index.ts

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
  compatibility: z.union([z.string(), z.array(z.string())]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export function parseSkillFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const { data, content: body } = matter(content);
  const frontmatter = SkillFrontmatterSchema.parse(data);
  return { frontmatter, body };
}

export function buildSkillContent(
  frontmatter: SkillFrontmatter,
  body: string,
): string {
  return matter.stringify(body, frontmatter);
}
