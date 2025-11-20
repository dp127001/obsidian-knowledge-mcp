/**
 * delete-file tool implementation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ServerContext } from '../server.js';
import { FileEntry, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { computeHash } from '../database/index.js';

export interface DeleteFileInput extends ProvenanceFields {
  vault: string;
  path: string;
  recursive?: boolean; // dirs only
  dryRun?: boolean;    // default false
}

export interface DeleteFileOutput {
  vault: string;
  path: string;
  deleted: boolean;
  isDirectory: boolean;
  wouldDeleteChildren?: FileEntry[]; // when dryRun
  historyEntryId?: number;
}

/**
 * Handle delete-file tool call
 */
export async function handleDeleteFile(
  context: ServerContext,
  args: DeleteFileInput
): Promise<ToolResponse<DeleteFileOutput>> {
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

    // Check idempotency
    if (args.requestId && context.db.checkRequestIdExists(args.requestId)) {
      return {
        status: 'error',
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'Request ID already processed (idempotency check)'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Check if file/directory exists
    const exists = await fileOps.fileExists(args.path);
    if (!exists) {
      return {
        status: 'error',
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File or directory not found: ${args.path}`
        }
      };
    }

    // Get absolute path for stat check
    const absolutePath = path.join(vault.path, args.path);
    const stats = await fs.stat(absolutePath);
    const isDirectory = stats.isDirectory();

    // Check if directory and recursive flag
    if (isDirectory && !args.recursive) {
      return {
        status: 'error',
        error: {
          code: 'DIRECTORY_REQUIRES_RECURSIVE',
          message: `Cannot delete directory without recursive flag: ${args.path}. Set recursive=true to delete directories.`
        }
      };
    }

    // If directory, get list of children
    let wouldDeleteChildren: FileEntry[] | undefined;
    if (isDirectory) {
      wouldDeleteChildren = await fileOps.listFiles(args.path, {
        recursive: true,
        notesOnly: false,
        includeMetadata: false
      });
    }

    // If dryRun, return what would be deleted
    if (args.dryRun === true) {
      return {
        status: 'ok',
        data: {
          vault: args.vault,
          path: args.path,
          deleted: false,
          isDirectory,
          wouldDeleteChildren
        },
        meta: {
          tool: 'delete-file',
          vault: args.vault,
          requestId: args.requestId,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Read content for hash (only for files)
    let finalHash = '';
    if (!isDirectory) {
      const content = await fileOps.readFile(args.path);
      finalHash = computeHash(content);
    }

    // Delete file or directory
    if (isDirectory) {
      await fileOps.deleteDirectory(args.path);
    } else {
      await fileOps.deleteFile(args.path);
    }

    // Record provenance (only for files, not directories)
    let historyEntryId: number | undefined;
    if (!isDirectory) {
      historyEntryId = context.db.recordHistory({
        vault: args.vault,
        path: args.path,
        timestamp: new Date().toISOString(),
        operation: 'delete',
        tool: 'delete-file',
        actor: args.actor || 'llm',
        source: args.source,
        request_id: args.requestId,
        prev_hash: finalHash,
        new_hash: '' // Empty hash for deleted file
      });
    }

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        path: args.path,
        deleted: true,
        isDirectory,
        wouldDeleteChildren: isDirectory ? wouldDeleteChildren : undefined,
        historyEntryId
      },
      meta: {
        tool: 'delete-file',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'DELETE_FILE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
