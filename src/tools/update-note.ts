/**
 * update-note tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteContent, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { serializeFrontmatter, parseFrontmatter, extractMetadata } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { lintMarkdown } from '../linter/engine.js';

export interface UpdateNoteInput extends ProvenanceFields {
  vault: string;
  path: string;
  newFrontmatter?: Record<string, any>;
  newBody?: string;
  mergeFrontmatterStrategy?: 'replace' | 'merge'; // default 'merge'
  autoLint?: boolean;
}

export interface UpdateNoteOutput {
  note: NoteContent;
  previousHash: string;
  newHash: string;
  historyEntryId: number;
}

/**
 * Handle update-note tool call
 */
export async function handleUpdateNote(
  context: ServerContext,
  args: UpdateNoteInput
): Promise<ToolResponse<UpdateNoteOutput>> {
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

    // Check if file exists
    const exists = await fileOps.fileExists(args.path);
    if (!exists) {
      return {
        status: 'error',
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${args.path}. Use create-note to create new files.`
        }
      };
    }

    // Read current file
    const currentContent = await fileOps.readFile(args.path);
    const previousHash = computeHash(currentContent);
    const parsed = parseFrontmatter(currentContent);

    // Determine merge strategy (default: merge)
    const strategy = args.mergeFrontmatterStrategy || 'merge';

    // Build new frontmatter
    let newFrontmatter: Record<string, any>;
    if (args.newFrontmatter) {
      if (strategy === 'merge') {
        // Shallow merge: preserve existing fields, override with new ones
        newFrontmatter = {
          ...parsed.frontmatter,
          ...args.newFrontmatter
        };
      } else {
        // Replace: use new frontmatter entirely
        newFrontmatter = args.newFrontmatter;
      }
    } else {
      // No frontmatter changes
      newFrontmatter = parsed.frontmatter || {};
    }

    // Update the 'updated' timestamp
    newFrontmatter.updated = new Date().toISOString();

    // Use new body if provided, otherwise keep current
    const newBody = args.newBody !== undefined ? args.newBody : parsed.body;

    // Serialize new content
    let newContent = serializeFrontmatter(newFrontmatter, newBody);

    // Apply autoLint if requested
    if (args.autoLint) {
      const lintResult = await lintMarkdown(newContent, { applyFixes: true });
      if (lintResult.fixed) {
        newContent = lintResult.content;
      }
    }

    // Compute new hash
    const newHash = computeHash(newContent);

    // Check if content actually changed
    if (previousHash === newHash) {
      // No changes, return current note without writing
      const stats = await fileOps.getFileStats(args.path);
      const metadata = extractMetadata(newFrontmatter, stats);

      return {
        status: 'ok',
        data: {
          note: {
            vault: args.vault,
            path: args.path,
            frontmatter: newFrontmatter,
            body: newBody,
            raw: newContent,
            metadata
          },
          previousHash,
          newHash,
          historyEntryId: 0 // No history entry created for no-op
        },
        meta: {
          tool: 'update-note',
          vault: args.vault,
          requestId: args.requestId,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Write updated file
    await fileOps.writeFile(args.path, newContent);

    // Record provenance
    const historyEntryId = context.db.recordHistory({
      vault: args.vault,
      path: args.path,
      timestamp: new Date().toISOString(),
      operation: 'update',
      tool: 'update-note',
      actor: args.actor || 'llm',
      source: args.source,
      request_id: args.requestId,
      prev_hash: previousHash,
      new_hash: newHash
    });

    // Read back stats
    const stats = await fileOps.getFileStats(args.path);
    const metadata = extractMetadata(newFrontmatter, stats);

    const result: UpdateNoteOutput = {
      note: {
        vault: args.vault,
        path: args.path,
        frontmatter: newFrontmatter,
        body: newBody,
        raw: newContent,
        metadata
      },
      previousHash,
      newHash,
      historyEntryId
    };

    return {
      status: 'ok',
      data: result,
      meta: {
        tool: 'update-note',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'UPDATE_NOTE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
