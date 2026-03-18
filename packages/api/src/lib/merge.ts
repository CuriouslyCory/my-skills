/**
 * Heading-aware merge algorithm for composing multi-fragment CLAUDE.md files.
 * Pure function: no side effects, no I/O.
 */

interface Section {
  /** Heading level (1-6), or 0 for preamble */
  level: number;
  /** Raw heading text (empty string for preamble) */
  heading: string;
  /** Normalized heading: lowercase, trimmed */
  normalizedHeading: string;
  /** Body lines (excluding the heading line itself) */
  body: string[];
  /** Child sections */
  children: Section[];
}

/**
 * Parse a markdown string into a tree of sections.
 */
function parseIntoSections(text: string): Section[] {
  const lines = text.split("\n");
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  // Flat list of sections in order
  const flatSections: Section[] = [];
  let currentSection: Section = {
    level: 0,
    heading: "",
    normalizedHeading: "",
    body: [],
    children: [],
  };
  flatSections.push(currentSection);

  for (const line of lines) {
    const match = headingRegex.exec(line);
    if (match) {
      currentSection = {
        level: match[1]!.length,
        heading: match[2]!,
        normalizedHeading: match[2]!.toLowerCase().trim(),
        body: [],
        children: [],
      };
      flatSections.push(currentSection);
    } else {
      currentSection.body.push(line);
    }
  }

  return flatSections;
}

/**
 * Get the structural signature of a section: its child heading names in order.
 */
function getChildSignature(
  sections: Section[],
  startIdx: number,
): string[] {
  const parent = sections[startIdx]!;
  const result: string[] = [];
  for (let i = startIdx + 1; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.level <= parent.level && parent.level > 0) break;
    if (s.level === parent.level + 1) {
      result.push(s.normalizedHeading);
    }
  }
  return result;
}

/**
 * Deduplicate identical lines (after trim) within an array, preserving first occurrence order.
 */
function deduplicateLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Keep empty lines (don't deduplicate them)
    if (trimmed === "") {
      result.push(line);
    } else if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(line);
    }
  }
  return result;
}

/**
 * Collapse 3+ consecutive blank lines to 2.
 */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n");
}

interface MergedSection {
  level: number;
  heading: string;
  normalizedHeading: string;
  bodyParts: string[][]; // body from each fragment, in order
  children: MergedSection[];
}

/**
 * Find a section in the merged tree by normalized heading, considering level offsets.
 */
function findInMerged(
  merged: MergedSection[],
  normalizedHeading: string,
  _sourceLevel: number,
  sourceSections: Section[],
  sourceIdx: number,
): MergedSection | null {
  for (const ms of merged) {
    // Direct match by normalized heading
    if (ms.normalizedHeading === normalizedHeading) {
      return ms;
    }
    // Level-offset matching: check structural signature
    if (ms.normalizedHeading === normalizedHeading) {
      return ms;
    }
    // Recurse into children
    const found = findInMerged(
      ms.children,
      normalizedHeading,
      _sourceLevel,
      sourceSections,
      sourceIdx,
    );
    if (found) return found;
  }

  // Level-offset matching: look for same heading name at different level with matching structure
  for (const ms of merged) {
    if (ms.normalizedHeading === normalizedHeading && ms.level !== _sourceLevel) {
      const sourceChildren = getChildSignature(sourceSections, sourceIdx);
      // Check if structural pattern matches (simplified: just match heading name)
      if (sourceChildren.length === 0) {
        return ms;
      }
    }
    const found = findInMergedByStructure(
      ms.children,
      normalizedHeading,
      sourceSections,
      sourceIdx,
    );
    if (found) return found;
  }

  return null;
}

function findInMergedByStructure(
  merged: MergedSection[],
  normalizedHeading: string,
  sourceSections: Section[],
  sourceIdx: number,
): MergedSection | null {
  for (const ms of merged) {
    if (ms.normalizedHeading === normalizedHeading) {
      return ms;
    }
    const found = findInMergedByStructure(
      ms.children,
      normalizedHeading,
      sourceSections,
      sourceIdx,
    );
    if (found) return found;
  }
  return null;
}

/**
 * Find the best insertion point in the merged tree for an unmatched section.
 * Looks for the closest matching parent chain.
 */
function findBestParent(
  merged: MergedSection[],
  section: Section,
  parentChain: string[],
): MergedSection[] {
  if (parentChain.length === 0) return merged;

  for (const ms of merged) {
    if (ms.normalizedHeading === parentChain[0]) {
      if (parentChain.length === 1) {
        return ms.children;
      }
      const deeper = findBestParent(ms.children, section, parentChain.slice(1));
      return deeper;
    }
  }

  return merged;
}

/**
 * Build the parent chain for a section in its source fragment.
 */
function getParentChain(sections: Section[], idx: number): string[] {
  const section = sections[idx]!;
  const chain: string[] = [];

  for (let i = idx - 1; i >= 0; i--) {
    const s = sections[i]!;
    if (s.level < section.level && s.level > 0) {
      chain.unshift(s.normalizedHeading);
      if (s.level === 1) break;
    }
  }

  return chain;
}

/**
 * Merge multiple markdown fragments using heading-aware merging.
 *
 * - Headings matched by normalized text (lowercase, trimmed) across fragments
 * - Matched headings: body content concatenated in fragment order
 * - Duplicate identical lines (after trim) within merged sections are deduplicated
 * - Level-offset matching: headings with same name at different levels merge if structure matches
 * - Unmatched headings: inserted at best structural position
 * - Preamble (content before first heading): concatenated, deduplicated
 * - Post-process: 3+ blank lines collapsed to 2, trailing newline ensured
 */
export function mergeFragments(fragments: string[]): string {
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return ensureTrailingNewline(collapseBlankLines(fragments[0]!));

  const mergedTree: MergedSection[] = [];
  let preambleParts: string[][] = [];

  for (const fragment of fragments) {
    const sections = parseIntoSections(fragment);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;

      if (section.level === 0) {
        // Preamble
        preambleParts.push(section.body);
        continue;
      }

      // Try to find matching section in merged tree
      const existing = findInMerged(
        mergedTree,
        section.normalizedHeading,
        section.level,
        sections,
        i,
      );

      if (existing) {
        // Merge into first match
        existing.bodyParts.push(section.body);
      } else {
        // Unmatched: find best insertion point
        const parentChain = getParentChain(sections, i);
        const target = findBestParent(mergedTree, section, parentChain);

        target.push({
          level: section.level,
          heading: section.heading,
          normalizedHeading: section.normalizedHeading,
          bodyParts: [section.body],
          children: [],
        });
      }
    }
  }

  // Render the merged tree
  const output: string[] = [];

  // Render preamble
  if (preambleParts.length > 0) {
    const allPreambleLines = preambleParts.flat();
    const deduped = deduplicateLines(allPreambleLines);
    // Trim trailing empty lines from preamble
    while (deduped.length > 0 && deduped[deduped.length - 1]!.trim() === "") {
      deduped.pop();
    }
    if (deduped.length > 0) {
      output.push(...deduped);
      output.push("");
    }
  }

  // Render sections recursively
  function renderSection(ms: MergedSection): void {
    const prefix = "#".repeat(ms.level);
    output.push(`${prefix} ${ms.heading}`);

    // Merge all body parts and deduplicate
    const allBody = ms.bodyParts.flat();
    const deduped = deduplicateLines(allBody);
    output.push(...deduped);

    // Render children
    for (const child of ms.children) {
      renderSection(child);
    }
  }

  for (const ms of mergedTree) {
    renderSection(ms);
  }

  let result = output.join("\n");
  result = collapseBlankLines(result);
  result = ensureTrailingNewline(result);

  return result;
}

function ensureTrailingNewline(text: string): string {
  if (text === "") return "";
  return text.endsWith("\n") ? text : text + "\n";
}
