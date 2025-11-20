/**
 * list-files-in-dir tool implementation
 */

import fuzzysort from 'fuzzysort';
import { ServerContext } from '../server.js';
import { FileEntry, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';

export interface ListFilesInDirInput {
  vault: string;
  directory: string;     // e.g. "Evergreen/Networking"
  includeMetadata?: boolean;
  notesOnly?: boolean;
  filterQuery?: string;
  recursive?: boolean;   // default false (only direct children)
}

export interface ListFilesInDirOutput {
  vault: string;
  directory: string;
  entries: FileEntry[];
}

/**
 * Handle list-files-in-dir tool call
 */
export async function handleListFilesInDir(
  context: ServerContext,
  args: ListFilesInDirInput
): Promise<ToolResponse<ListFilesInDirOutput>> {
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

    if (!args.directory) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_DIRECTORY',
          message: 'directory parameter is required'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);

    // List files in directory
    const fileOps = new FileOperations(vault.path);
    let entries = await fileOps.listFiles(args.directory, {
      recursive: args.recursive === true,
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
        directory: args.directory,
        entries
      },
      meta: {
        tool: 'list-files-in-dir',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'LIST_FILES_IN_DIR_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
