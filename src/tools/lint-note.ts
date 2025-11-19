/**
 * lint-note tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteContent, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter, extractMetadata } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { lintMarkdown, LintSettings, LintDiagnostic } from '../linter/engine.js';

export interface LintNoteInput extends ProvenanceFields {
  vault: string;
  path: string;
  applyFixes?: boolean; // Default: false
  lintSettings?: LintSettings;
}

export interface LintNoteOutput {
  note: NoteContent;
  diagnostics: LintDiagnostic[];
  fixed: boolean;
  issueCount: number;
}

/**
 * Handle lint-note tool call
 */
export async function handleLintNote(
  context: ServerContext,
  args: LintNoteInput
): Promise<ToolResponse<LintNoteOutput>> {
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

    // Check idempotency (only if applying fixes)
    if (args.applyFixes && args.requestId && context.db.checkRequestIdExists(args.requestId)) {
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
          message: `File not found: ${args.path}`
        }
      };
    }

    // Read file
    const content = await fileOps.readFile(args.path);
    const originalHash = computeHash(content);

    // Lint the content
    const lintSettings: LintSettings = {
      ...args.lintSettings,
      applyFixes: args.applyFixes || false
    };

    const lintResult = await lintMarkdown(content, lintSettings);

    // If fixes were applied, write the file
    let finalContent = content;
    if (lintResult.fixed && args.applyFixes) {
      finalContent = lintResult.content;
      await fileOps.writeFile(args.path, finalContent);

      // Record provenance
      const newHash = computeHash(finalContent);
      context.db.recordHistory({
        vault: args.vault,
        path: args.path,
        timestamp: new Date().toISOString(),
        operation: 'update',
        tool: 'lint-note',
        actor: args.actor || 'system',
        source: args.source || 'lint-note',
        request_id: args.requestId,
        prev_hash: originalHash,
        new_hash: newHash
      });
    }

    // Parse final content
    const parsed = parseFrontmatter(finalContent);
    const stats = await fileOps.getFileStats(args.path);
    const metadata = extractMetadata(parsed.frontmatter, stats);

    // Count issues (errors and warnings only)
    const issueCount = lintResult.diagnostics.filter(
      d => d.severity === 'error' || d.severity === 'warning'
    ).length;

    return {
      status: 'ok',
      data: {
        note: {
          vault: args.vault,
          path: args.path,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          raw: finalContent,
          metadata
        },
        diagnostics: lintResult.diagnostics,
        fixed: lintResult.fixed,
        issueCount
      },
      meta: {
        tool: 'lint-note',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'LINT_NOTE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
