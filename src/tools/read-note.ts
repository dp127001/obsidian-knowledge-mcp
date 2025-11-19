/**
 * read-note tool implementation
 */

import * as path from 'path';
import { ServerContext } from '../server.js';
import { NoteContent, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter, extractMetadata } from '../vault/frontmatter.js';

export interface ReadNoteInput {
  vault: string;
  path: string;
  includeRaw?: boolean;
  includeBody?: boolean;
  includeFrontmatter?: boolean;
}

/**
 * Handle read-note tool call
 */
export async function handleReadNote(
  context: ServerContext,
  args: ReadNoteInput
): Promise<ToolResponse<NoteContent>> {
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

    // Check file extension
    const ext = path.extname(args.path);
    if (ext !== '.md') {
      return {
        status: 'error',
        error: {
          code: 'UNSUPPORTED_TYPE',
          message: 'Only .md files are supported for read-note'
        }
      };
    }

    // Read file
    const fileOps = new FileOperations(vault.path);
    const content = await fileOps.readFile(args.path);

    // Parse frontmatter
    const parsed = parseFrontmatter(content);

    // Get file stats
    const stats = await fileOps.getFileStats(args.path);

    // Extract metadata
    const metadata = extractMetadata(parsed.frontmatter, stats);

    // Build response based on options
    const includeRaw = args.includeRaw !== false;
    const includeBody = args.includeBody !== false;
    const includeFrontmatter = args.includeFrontmatter !== false;

    const result: NoteContent = {
      vault: args.vault,
      path: args.path,
      frontmatter: includeFrontmatter ? parsed.frontmatter : null,
      body: includeBody ? parsed.body : '',
      raw: includeRaw ? parsed.raw : '',
      metadata
    };

    return {
      status: 'ok',
      data: result,
      meta: {
        tool: 'read-note',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
        return {
          status: 'error',
          error: {
            code: 'FILE_NOT_FOUND',
            message: `File not found: ${args.path}`
          }
        };
      }

      if (error.message.includes('Path traversal')) {
        return {
          status: 'error',
          error: {
            code: 'INVALID_PATH',
            message: error.message
          }
        };
      }
    }

    return {
      status: 'error',
      error: {
        code: 'READ_NOTE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
