/**
 * Frontmatter parsing and serialization
 */

import matter from 'gray-matter';
import { NoteMetadata } from '../types/core.js';

/**
 * Parse result from frontmatter extraction
 */
export interface ParsedNote {
  frontmatter: Record<string, any> | null;
  body: string;
  raw: string;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): ParsedNote {
  try {
    const parsed = matter(content);

    return {
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : null,
      body: parsed.content,
      raw: content
    };
  } catch (error) {
    // If parsing fails, treat entire content as body
    return {
      frontmatter: null,
      body: content,
      raw: content
    };
  }
}

/**
 * Serialize frontmatter and body back to markdown
 */
export function serializeFrontmatter(
  frontmatter: Record<string, any> | null,
  body: string
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body;
  }

  return matter.stringify(body, frontmatter);
}

/**
 * Extract metadata from frontmatter
 */
export function extractMetadata(
  frontmatter: Record<string, any> | null,
  fileStats?: {
    sizeBytes: number;
    created: string;
    modified: string;
  }
): NoteMetadata {
  const metadata: NoteMetadata = {};

  if (frontmatter) {
    // Extract standard fields
    if (frontmatter.created) metadata.created = String(frontmatter.created);
    if (frontmatter.updated) metadata.updated = String(frontmatter.updated);
    if (frontmatter.type) metadata.type = String(frontmatter.type);
    if (frontmatter.para) metadata.para = String(frontmatter.para);
    if (frontmatter.stage) metadata.stage = String(frontmatter.stage);
    if (frontmatter.status) metadata.status = String(frontmatter.status);
    if (frontmatter.confidence) metadata.confidence = String(frontmatter.confidence);

    // Extract tags (handle both array and string formats)
    if (frontmatter.tags) {
      if (Array.isArray(frontmatter.tags)) {
        metadata.tags = frontmatter.tags.map(t => String(t));
      } else if (typeof frontmatter.tags === 'string') {
        metadata.tags = frontmatter.tags.split(',').map(t => t.trim());
      }
    }
  }

  // Add file stats if available
  if (fileStats) {
    metadata.sizeBytes = fileStats.sizeBytes;
    if (!metadata.created) metadata.created = fileStats.created;
    if (!metadata.updated) metadata.updated = fileStats.modified;
  }

  return metadata;
}

/**
 * Merge frontmatter objects
 */
export function mergeFrontmatter(
  existing: Record<string, any> | null,
  updates: Record<string, any> | null,
  strategy: 'replace' | 'merge' = 'merge'
): Record<string, any> | null {
  if (!updates || Object.keys(updates).length === 0) {
    return existing;
  }

  if (strategy === 'replace' || !existing) {
    return updates;
  }

  // Merge strategy: shallow merge with updates taking precedence
  return { ...existing, ...updates };
}

/**
 * Update frontmatter field
 */
export function updateFrontmatterField(
  frontmatter: Record<string, any> | null,
  key: string,
  value: any
): Record<string, any> {
  const result = frontmatter ? { ...frontmatter } : {};
  result[key] = value;
  return result;
}

/**
 * Remove frontmatter field
 */
export function removeFrontmatterField(
  frontmatter: Record<string, any> | null,
  key: string
): Record<string, any> | null {
  if (!frontmatter) return null;

  const result = { ...frontmatter };
  delete result[key];

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Extract tags from content (both frontmatter and inline)
 */
export function extractAllTags(content: string, frontmatter: Record<string, any> | null): string[] {
  const tags = new Set<string>();

  // Tags from frontmatter
  if (frontmatter?.tags) {
    const fmTags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : [frontmatter.tags];

    fmTags.forEach(tag => tags.add(String(tag)));
  }

  // Inline tags (e.g., #tag or #nested/tag)
  const tagRegex = /#([\w/-]+)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}
