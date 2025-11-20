/**
 * get-note-history tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, NoteHistoryEntry, Pagination, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';

export interface GetNoteHistoryInput {
  vault: string;
  path: string;
  limit?: number;  // default 20
  offset?: number; // default 0
}

export interface GetNoteHistoryOutput {
  note: NoteRef;
  entries: NoteHistoryEntry[];
  pagination: Pagination;
}

/**
 * Handle get-note-history tool call
 */
export async function handleGetNoteHistory(
  context: ServerContext,
  args: GetNoteHistoryInput
): Promise<ToolResponse<GetNoteHistoryOutput>> {
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

    if (!args.path) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_PATH',
          message: 'path parameter is required'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);

    // Check if note exists
    const fileOps = new FileOperations(vault.path);
    const exists = await fileOps.fileExists(args.path);

    if (!exists) {
      return {
        status: 'error',
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${args.path}`
        }
      };
    }

    // Get history from database
    const limit = args.limit || 20;
    const offset = args.offset || 0;

    const { entries, total } = context.db.getNoteHistory(
      args.vault,
      args.path,
      limit,
      offset
    );

    const result: GetNoteHistoryOutput = {
      note: {
        vault: args.vault,
        path: args.path
      },
      entries,
      pagination: {
        limit,
        offset,
        total
      }
    };

    return {
      status: 'ok',
      data: result,
      meta: {
        tool: 'get-note-history',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'GET_NOTE_HISTORY_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
