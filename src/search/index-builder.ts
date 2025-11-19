/**
 * Search index builder
 */

import { VaultConfig } from '../types/core.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter, extractAllTags } from '../vault/frontmatter.js';
import { SearchIndexEntry } from './engine.js';
import * as path from 'path';

/**
 * Build search index for a vault
 */
export async function buildSearchIndex(vault: VaultConfig): Promise<SearchIndexEntry[]> {
  const entries: SearchIndexEntry[] = [];
  const fileOps = new FileOperations(vault.path);

  // List all markdown files
  const files = await fileOps.listFiles('', {
    recursive: true,
    notesOnly: true,
    includeMetadata: false
  });

  // Process each file
  for (const file of files) {
    if (file.type !== 'file' || file.ext !== '.md') {
      continue;
    }

    try {
      // Read file content
      const content = await fileOps.readFile(file.path);

      // Parse frontmatter
      const parsed = parseFrontmatter(content);

      // Extract tags
      const tags = extractAllTags(content, parsed.frontmatter);

      // Get title from frontmatter or filename
      const title = parsed.frontmatter?.title
        || path.basename(file.path, '.md');

      entries.push({
        vault: vault.id,
        path: file.path,
        title,
        content: parsed.body,
        tags,
        frontmatter: parsed.frontmatter
      });
    } catch (error) {
      // Skip files that can't be read
      console.error(`Failed to index ${file.path}:`, error);
    }
  }

  return entries;
}

/**
 * Build search index for multiple vaults
 */
export async function buildMultiVaultIndex(vaults: VaultConfig[]): Promise<SearchIndexEntry[]> {
  const allEntries: SearchIndexEntry[] = [];

  for (const vault of vaults) {
    if (!vault.enabled) continue;

    const entries = await buildSearchIndex(vault);
    allEntries.push(...entries);
  }

  return allEntries;
}
