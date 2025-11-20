/**
 * patch-content tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { handleUpdateNote } from './update-note.js';

export interface PatchContentInput extends ProvenanceFields {
  vault: string;
  path: string;
  anchorType: 'heading' | 'block' | 'frontmatter';
  anchorValue: string;
  content: string;
  position?: 'before' | 'after' | 'replace'; // default 'after'
  autoLint?: boolean;
}

export interface PatchContentOutput {
  note: NoteRef;
  newSizeBytes: number;
  previousHash: string;
  newHash: string;
  historyEntryId: number;
}

/**
 * Find heading in markdown body
 * Returns line index or -1 if not found
 */
function findHeading(lines: string[], heading: string): number {
  const headingPattern = /^(#{1,6})\s+(.+)$/;
  const normalizedTarget = heading.trim().toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingPattern);
    if (match) {
      const headingText = match[2].trim().toLowerCase();
      if (headingText === normalizedTarget) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Find block reference in markdown body
 * Returns line index or -1 if not found
 */
function findBlock(lines: string[], blockId: string): number {
  const blockPattern = new RegExp(`\\^${blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (blockPattern.test(lines[i])) {
      return i;
    }
  }

  return -1;
}

/**
 * Find the end of a heading section
 * Returns the line index before the next heading of same or higher level
 */
function findHeadingSectionEnd(lines: string[], startIndex: number): number {
  const startLine = lines[startIndex];
  const headingMatch = startLine.match(/^(#{1,6})\s+/);

  if (!headingMatch) {
    return startIndex;
  }

  const startLevel = headingMatch[1].length;

  // Find next heading of same or higher level
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= startLevel) {
      return i - 1; // Return line before next heading
    }
  }

  return lines.length - 1; // End of document
}

/**
 * Handle patch-content tool call
 */
export async function handlePatchContent(
  context: ServerContext,
  args: PatchContentInput
): Promise<ToolResponse<PatchContentOutput>> {
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

    if (!args.anchorType) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_ANCHOR_TYPE',
          message: 'anchorType parameter is required'
        }
      };
    }

    if (!args.anchorValue) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_ANCHOR_VALUE',
          message: 'anchorValue parameter is required'
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
      return {
        status: 'error',
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${args.path}`
        }
      };
    }

    // Read current file
    const currentContent = await fileOps.readFile(args.path);
    const parsed = parseFrontmatter(currentContent);

    const position = args.position || 'after';
    let newBody = parsed.body;
    let newFrontmatter = parsed.frontmatter || {};

    // Handle different anchor types
    if (args.anchorType === 'frontmatter') {
      // Patch frontmatter key
      if (position === 'replace') {
        newFrontmatter[args.anchorValue] = args.content;
      } else {
        return {
          status: 'error',
          error: {
            code: 'INVALID_POSITION',
            message: 'Frontmatter anchors only support position="replace"'
          }
        };
      }
    } else if (args.anchorType === 'heading') {
      // Patch at heading
      const lines = parsed.body.split('\n');
      const headingIndex = findHeading(lines, args.anchorValue);

      if (headingIndex === -1) {
        return {
          status: 'error',
          error: {
            code: 'ANCHOR_NOT_FOUND',
            message: `Heading not found: ${args.anchorValue}`
          }
        };
      }

      if (position === 'before') {
        // Insert before heading
        lines.splice(headingIndex, 0, args.content);
      } else if (position === 'after') {
        // Insert after heading (at start of section)
        lines.splice(headingIndex + 1, 0, '', args.content);
      } else if (position === 'replace') {
        // Replace entire section
        const sectionEnd = findHeadingSectionEnd(lines, headingIndex);
        lines.splice(headingIndex + 1, sectionEnd - headingIndex, '', args.content);
      }

      newBody = lines.join('\n');
    } else if (args.anchorType === 'block') {
      // Patch at block reference
      const lines = parsed.body.split('\n');
      const blockIndex = findBlock(lines, args.anchorValue);

      if (blockIndex === -1) {
        return {
          status: 'error',
          error: {
            code: 'ANCHOR_NOT_FOUND',
            message: `Block reference not found: ^${args.anchorValue}`
          }
        };
      }

      if (position === 'before') {
        lines.splice(blockIndex, 0, args.content);
      } else if (position === 'after') {
        lines.splice(blockIndex + 1, 0, args.content);
      } else if (position === 'replace') {
        lines[blockIndex] = args.content;
      }

      newBody = lines.join('\n');
    } else {
      return {
        status: 'error',
        error: {
          code: 'INVALID_ANCHOR_TYPE',
          message: `Invalid anchor type: ${args.anchorType}. Must be 'heading', 'block', or 'frontmatter'.`
        }
      };
    }

    // Use update-note to apply the changes
    const updateResult = await handleUpdateNote(context, {
      vault: args.vault,
      path: args.path,
      newFrontmatter: newFrontmatter,
      newBody: newBody,
      mergeFrontmatterStrategy: 'replace', // We've already handled merging
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
        newSizeBytes: updated.note.metadata?.sizeBytes || 0,
        previousHash: updated.previousHash,
        newHash: updated.newHash,
        historyEntryId: updated.historyEntryId
      },
      meta: {
        tool: 'patch-content',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'PATCH_CONTENT_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
