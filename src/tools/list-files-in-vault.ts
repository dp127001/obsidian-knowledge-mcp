/**
 * list-files-in-vault tool implementation
 */

import fuzzysort from 'fuzzysort';
import { ServerContext } from '../server.js';
import { FileEntry, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';

export interface ListFilesInVaultInput {
  vault: string;
  includeMetadata?: boolean;  // default false
  notesOnly?: boolean;        // default true
  filterQuery?: string;       // optional fuzzy filter via fuzzysort
}

export interface ListFilesInVaultOutput {
  vault: string;
  entries: FileEntry[];
}

/**
 * Handle list-files-in-vault tool call
 */
export async function handleListFilesInVault(
  context: ServerContext,
  args: ListFilesInVaultInput
): Promise<ToolResponse<ListFilesInVaultOutput>> {
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

    // List files
    const fileOps = new FileOperations(vault.path);
    let entries = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: args.notesOnly !== false,
      includeMetadata: args.includeMetadata === true
    });

    // Apply fuzzy filter if provided
    if (args.filterQuery) {
      const results = fuzzysort.go(args.filterQuery, entries, {
        keys: ['path', 'name'],
        threshold: -10000
      });

      entries = results.map(result => ({
        ...result.obj,
        score: result.score / 1000 + 1 // Normalize to 0-1 range
      }));
    }

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        entries
      },
      meta: {
        tool: 'list-files-in-vault',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'LIST_FILES_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
