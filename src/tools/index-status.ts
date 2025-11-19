/**
 * index-status tool implementation
 * Check search index status for a vault
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { buildSearchIndex } from '../search/index-builder.js';

export interface IndexStatusInput {
  vault: string;
}

export interface IndexStatusOutput {
  vault: string;
  totalFiles: number;
  indexedFiles: number;
  needsRebuild: boolean;
  lastIndexedAt?: string;
  indexSize: number; // Number of entries in index
  avgIndexEntrySize: number; // Average size in bytes
}

/**
 * Handle index-status tool call
 */
export async function handleIndexStatus(
  context: ServerContext,
  args: IndexStatusInput
): Promise<ToolResponse<IndexStatusOutput>> {
  try {
    // Validate inputs
    if (!args.vault) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_VAULT',
          message: 'vault parameter is required'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Count total files
    const files = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: false
    });

    const totalFiles = files.filter(f => f.type === 'file' && f.path.endsWith('.md')).length;

    // Build index (in-memory, not persisted)
    const indexEntries = await buildSearchIndex(vault);
    const indexedFiles = indexEntries.length;

    // Calculate index size metrics
    let totalIndexSize = 0;
    for (const entry of indexEntries) {
      // Approximate entry size: path + title + content + tags + frontmatter
      const entrySize =
        entry.path.length +
        entry.title.length +
        entry.content.length +
        entry.tags.join('').length +
        (entry.frontmatter ? JSON.stringify(entry.frontmatter).length : 0);
      totalIndexSize += entrySize;
    }

    const avgIndexEntrySize = indexedFiles > 0 ? Math.round(totalIndexSize / indexedFiles) : 0;

    // Determine if rebuild is needed (if indexed files don't match total files)
    const needsRebuild = indexedFiles !== totalFiles;

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        totalFiles,
        indexedFiles,
        needsRebuild,
        indexSize: indexedFiles,
        avgIndexEntrySize
      },
      meta: {
        tool: 'index-status',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'INDEX_STATUS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
