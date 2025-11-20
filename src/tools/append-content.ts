/**
 * append-content tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { handleCreateNote } from './create-note.js';
import { handleUpdateNote } from './update-note.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface AppendContentInput extends ProvenanceFields {
  vault: string;
  path: string;
  content: string;
  createIfNotExists?: boolean; // default true
  autoLint?: boolean;
}

export interface AppendContentOutput {
  note: NoteRef;
  created: boolean;
  newSizeBytes: number;
  previousHash?: string;
  newHash: string;
  historyEntryId: number;
}

/**
 * Handle append-content tool call
 */
export async function handleAppendContent(
  context: ServerContext,
  args: AppendContentInput
): Promise<ToolResponse<AppendContentOutput>> {
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

    if (!args.content) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_CONTENT',
          message: 'content parameter is required'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Check if file exists
    const exists = await fileOps.fileExists(args.path);

    if (!exists) {
      // Create new file if allowed
      if (args.createIfNotExists !== false) {
        const createResult = await handleCreateNote(context, {
          vault: args.vault,
          path: args.path,
          body: args.content,
          autoLint: args.autoLint,
          source: args.source,
          actor: args.actor,
          requestId: args.requestId
        });

        if (createResult.status === 'error') {
          return {
            status: 'error',
            error: createResult.error!
          };
        }

        const note = createResult.data!.note;

        return {
          status: 'ok',
          data: {
            note: {
              vault: note.vault,
              path: note.path
            },
            created: true,
            newSizeBytes: note.metadata?.sizeBytes || 0,
            newHash: '', // Hash recorded by create-note
            historyEntryId: 0 // Created via create-note
          },
          meta: {
            tool: 'append-content',
            vault: args.vault,
            requestId: args.requestId,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        return {
          status: 'error',
          error: {
            code: 'FILE_NOT_FOUND',
            message: `File not found: ${args.path}. Set createIfNotExists=true to create automatically.`
          }
        };
      }
    }

    // File exists, append content
    const currentContent = await fileOps.readFile(args.path);
    const parsed = parseFrontmatter(currentContent);

    // Append content to body with double newline separator
    const newBody = parsed.body + '\n\n' + args.content;

    // Update note with new body
    const updateResult = await handleUpdateNote(context, {
      vault: args.vault,
      path: args.path,
      newBody: newBody,
      autoLint: args.autoLint,
      source: args.source,
      actor: args.actor,
      requestId: args.requestId
    });

    if (updateResult.status === 'error') {
      return {
        status: 'error',
        error: updateResult.error!
      };
    }

    const updated = updateResult.data!;

    return {
      status: 'ok',
      data: {
        note: {
          vault: updated.note.vault,
          path: updated.note.path
        },
        created: false,
        newSizeBytes: updated.note.metadata?.sizeBytes || 0,
        previousHash: updated.previousHash,
        newHash: updated.newHash,
        historyEntryId: updated.historyEntryId
      },
      meta: {
        tool: 'append-content',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'APPEND_CONTENT_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
