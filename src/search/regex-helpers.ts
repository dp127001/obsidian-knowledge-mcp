/**
 * Safe regex helpers for markdown parsing
 * These helpers provide safe, tested patterns for extracting markdown structures
 */

/**
 * Wikilink patterns for Obsidian
 */
export const WIKILINK_PATTERNS = {
  /**
   * Match standard wikilinks: [[target]] or [[target|display]]
   */
  STANDARD: /\[\[([^\]]+)\]\]/g,

  /**
   * Match wikilinks with sections: [[note#section]]
   */
  WITH_SECTION: /\[\[([^#\]]+)#([^\]]+)\]\]/g,

  /**
   * Match wikilinks with block references: [[note#^block-id]]
   */
  WITH_BLOCK: /\[\[([^#\]]+)#\^([^\]]+)\]\]/g,

  /**
   * Match embedded wikilinks: ![[file]]
   */
  EMBED: /!\[\[([^\]]+)\]\]/g
};

/**
 * Heading patterns
 */
export const HEADING_PATTERNS = {
  /**
   * Match any heading (# to ######)
   */
  ANY: /^(#{1,6})\s+(.+)$/gm,

  /**
   * Match specific heading level
   */
  level: (level: number) => new RegExp(`^#{${level}}\\s+(.+)$`, 'gm')
};

/**
 * Tag patterns
 */
export const TAG_PATTERNS = {
  /**
   * Match inline tags: #tag or #nested/tag
   */
  INLINE: /#([\w/-]+)/g,

  /**
   * Match tags excluding code blocks
   */
  INLINE_SAFE: /(?:^|[^`])#([\w/-]+)(?:[^`]|$)/g
};

/**
 * Block reference patterns
 */
export const BLOCK_PATTERNS = {
  /**
   * Match block IDs: ^block-id
   */
  ID: /\^([\w-]+)$/gm,

  /**
   * Match block references in content
   */
  REFERENCE: /#\^([\w-]+)/g
};

/**
 * Frontmatter pattern
 */
export const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

/**
 * Extract wikilinks from content
 */
export function extractWikilinks(content: string): Array<{
  raw: string;
  target: string;
  display?: string;
  section?: string;
  blockId?: string;
  isEmbed: boolean;
}> {
  const links: Array<{
    raw: string;
    target: string;
    display?: string;
    section?: string;
    blockId?: string;
    isEmbed: boolean;
  }> = [];

  // Reset regex state
  WIKILINK_PATTERNS.STANDARD.lastIndex = 0;

  let match;
  while ((match = WIKILINK_PATTERNS.STANDARD.exec(content)) !== null) {
    const raw = match[0];
    const inner = match[1];
    const isEmbed = raw.startsWith('![[');

    // Check for block reference
    const blockMatch = inner.match(/^([^#]+)#\^(.+)$/);
    if (blockMatch) {
      links.push({
        raw,
        target: blockMatch[1],
        blockId: blockMatch[2],
        isEmbed
      });
      continue;
    }

    // Check for section
    const sectionMatch = inner.match(/^([^#]+)#(.+)$/);
    if (sectionMatch) {
      links.push({
        raw,
        target: sectionMatch[1],
        section: sectionMatch[2],
        isEmbed
      });
      continue;
    }

    // Check for display text
    const parts = inner.split('|');
    if (parts.length === 2) {
      links.push({
        raw,
        target: parts[0].trim(),
        display: parts[1].trim(),
        isEmbed
      });
    } else {
      links.push({
        raw,
        target: inner.trim(),
        isEmbed
      });
    }
  }

  return links;
}

/**
 * Extract headings from content
 */
export function extractHeadings(content: string): Array<{
  level: number;
  text: string;
  line: number;
}> {
  const headings: Array<{ level: number; text: string; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1
      });
    }
  }

  return headings;
}

/**
 * Extract tags from content (excluding code blocks)
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();

  // Remove code blocks first
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

  // Reset regex state
  TAG_PATTERNS.INLINE.lastIndex = 0;

  let match;
  while ((match = TAG_PATTERNS.INLINE.exec(withoutCodeBlocks)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Extract block IDs from content
 */
export function extractBlockIds(content: string): Array<{
  id: string;
  line: number;
}> {
  const blocks: Array<{ id: string; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/\^([\w-]+)$/);

    if (match) {
      blocks.push({
        id: match[1],
        line: i + 1
      });
    }
  }

  return blocks;
}

/**
 * Find heading by text
 */
export function findHeading(
  content: string,
  headingText: string
): { level: number; text: string; line: number } | null {
  const headings = extractHeadings(content);
  return headings.find(h => h.text === headingText) || null;
}

/**
 * Get content section by heading
 */
export function getContentSection(
  content: string,
  headingText: string
): string | null {
  const lines = content.split('\n');
  const headings = extractHeadings(content);

  const heading = headings.find(h => h.text === headingText);
  if (!heading) return null;

  const startLine = heading.line;

  // Find next heading of same or higher level
  const nextHeading = headings.find(
    h => h.line > startLine && h.level <= heading.level
  );

  const endLine = nextHeading ? nextHeading.line - 1 : lines.length;

  return lines.slice(startLine, endLine).join('\n');
}

/**
 * Create a search-safe regex pattern
 */
export function createSearchPattern(query: string, caseSensitive: boolean = false): RegExp {
  // Escape special regex characters
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, caseSensitive ? 'g' : 'gi');
}

/**
 * Check if content contains pattern
 */
export function contentMatches(
  content: string,
  pattern: string | RegExp,
  caseSensitive: boolean = false
): boolean {
  if (typeof pattern === 'string') {
    const regex = createSearchPattern(pattern, caseSensitive);
    return regex.test(content);
  }
  return pattern.test(content);
}

/**
 * Extract snippet around match
 */
export function extractSnippet(
  content: string,
  pattern: string | RegExp,
  contextChars: number = 100
): string | null {
  const regex = typeof pattern === 'string'
    ? createSearchPattern(pattern, false)
    : pattern;

  const match = regex.exec(content);
  if (!match) return null;

  const matchPos = match.index;
  const start = Math.max(0, matchPos - contextChars);
  const end = Math.min(content.length, matchPos + match[0].length + contextChars);

  let snippet = content.substring(start, end);

  // Add ellipsis if truncated
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}
