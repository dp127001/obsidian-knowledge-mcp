/**
 * rebuild-index tool implementation
 * Force rebuild of search index for a vault
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { buildSearchIndex } from '../search/index-builder.js';

export interface RebuildIndexInput {
  vault: string;
}

export interface RebuildIndexOutput {
  vault: string;
  filesIndexed: number;
  rebuildTime: number; // milliseconds
  success: boolean;
}

/**
 * Handle rebuild-index tool call
 */
export async function handleRebuildIndex(
  context: ServerContext,
  args: RebuildIndexInput
): Promise<ToolResponse<RebuildIndexOutput>> {
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

    // Rebuild index with timing
    const startTime = Date.now();
    const indexEntries = await buildSearchIndex(vault);
    const rebuildTime = Date.now() - startTime;

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        filesIndexed: indexEntries.length,
        rebuildTime,
        success: true
      },
      meta: {
        tool: 'rebuild-index',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'REBUILD_INDEX_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
