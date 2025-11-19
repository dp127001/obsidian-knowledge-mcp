/**
 * lint-folder tool implementation
 * Batch wrapper over lint-note
 */

import { ServerContext } from '../server.js';
import { NoteRef, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { lintMarkdown, LintSettings, LintDiagnostic } from '../linter/engine.js';
import { computeHash } from '../database/index.js';

export interface LintFolderInput extends ProvenanceFields {
  vault: string;
  folder?: string; // Default: root ('')
  recursive?: boolean; // Default: true
  applyFixes?: boolean; // Default: false
  lintSettings?: LintSettings;
  limit?: number; // Max files to lint (default: 100)
}

export interface FileLintResult {
  note: NoteRef;
  diagnostics: LintDiagnostic[];
  fixed: boolean;
  issueCount: number;
}

export interface LintFolderOutput {
  results: FileLintResult[];
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  filesFixed: number;
}

/**
 * Handle lint-folder tool call
 */
export async function handleLintFolder(
  context: ServerContext,
  args: LintFolderInput
): Promise<ToolResponse<LintFolderOutput>> {
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
    const fileOps = new FileOperations(vault.path);

    // List files in folder
    const folder = args.folder || '';
    const recursive = args.recursive !== false;
    const limit = args.limit || 100;

    const files = await fileOps.listFiles(folder, {
      recursive,
      notesOnly: true,
      includeMetadata: false
    });

    // Filter to notes and apply limit
    const notePaths = files
      .filter(f => f.type === 'file' && f.path.endsWith('.md'))
      .map(f => f.path)
      .slice(0, limit);

    // Lint settings
    const lintSettings: LintSettings = {
      ...args.lintSettings,
      applyFixes: args.applyFixes || false
    };

    // Lint each file
    const results: FileLintResult[] = [];
    let filesWithIssues = 0;
    let totalIssues = 0;
    let filesFixed = 0;
    const timestamp = new Date().toISOString();

    for (const notePath of notePaths) {
      try {
        // Read file
        const content = await fileOps.readFile(notePath);
        const originalHash = computeHash(content);

        // Lint the content
        const lintResult = await lintMarkdown(content, lintSettings);

        // Count issues
        const issueCount = lintResult.diagnostics.filter(
          d => d.severity === 'error' || d.severity === 'warning'
        ).length;

        if (issueCount > 0) {
          filesWithIssues++;
          totalIssues += issueCount;
        }

        // If fixes were applied, write the file
        if (lintResult.fixed && args.applyFixes) {
          await fileOps.writeFile(notePath, lintResult.content);
          filesFixed++;

          // Record provenance
          const newHash = computeHash(lintResult.content);
          context.db.recordHistory({
            vault: args.vault,
            path: notePath,
            timestamp,
            operation: 'update',
            tool: 'lint-folder',
            actor: args.actor || 'system',
            source: args.source || `lint-folder:${folder || 'root'}`,
            request_id: args.requestId,
            prev_hash: originalHash,
            new_hash: newHash
          });
        }

        results.push({
          note: {
            vault: args.vault,
            path: notePath
          },
          diagnostics: lintResult.diagnostics,
          fixed: lintResult.fixed,
          issueCount
        });
      } catch (error) {
        // Skip files that can't be linted
        results.push({
          note: {
            vault: args.vault,
            path: notePath
          },
          diagnostics: [
            {
              ruleId: 'lint-error',
              message: error instanceof Error ? error.message : String(error),
              severity: 'error',
              fixable: false
            }
          ],
          fixed: false,
          issueCount: 1
        });
        filesWithIssues++;
        totalIssues++;
      }
    }

    return {
      status: 'ok',
      data: {
        results,
        totalFiles: results.length,
        filesWithIssues,
        totalIssues,
        filesFixed
      },
      meta: {
        tool: 'lint-folder',
        vault: args.vault,
        requestId: args.requestId,
        timestamp
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'LINT_FOLDER_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
