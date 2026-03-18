import matter from "gray-matter";

import type { SkillFrontmatter } from "./index.js";
import { SkillFrontmatterSchema } from "./index.js";

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
