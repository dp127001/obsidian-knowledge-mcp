/**
 * evergreen-note tool implementation
 * Promotes atomic notes to evergreen status with synthesis
 */

import { ServerContext } from '../server.js';
import { NoteRef, NoteContent, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter, serializeFrontmatter } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { CanonicalFrontmatter } from '../vault/frontmatter-schema.js';
import { lintMarkdown } from '../linter/engine.js';

export interface EvergreenNoteInput extends ProvenanceFields {
  vault: string;
  path?: string; // Path for new evergreen note (if creating)
  title: string;
  sourceNotes?: NoteRef[]; // Atomic notes to synthesize
  body?: string; // Manual body content
  tags?: string[];
  updateExisting?: boolean; // If true, update existing note at path
  autoLint?: boolean; // Apply linting to generated note (default: false)
}

export interface EvergreenNoteOutput {
  note: NoteContent;
  created: boolean;
  sourcesLinked: number;
}

/**
 * Generate evergreen note body from sources
 */
async function synthesizeFromSources(
  vault: any,
  sourceNotes: NoteRef[]
): Promise<{ body: string; sources: string[] }> {
  const fileOps = new FileOperations(vault.path);
  const sources: string[] = [];
  let synthesizedContent = '';

  for (const sourceRef of sourceNotes) {
    try {
      const content = await fileOps.readFile(sourceRef.path);
      const parsed = parseFrontmatter(content);

      sources.push(sourceRef.path);

      // Extract key content from source
      synthesizedContent += `## From [[${sourceRef.path}]]\n\n`;

      // Extract first meaningful paragraph
      const paragraphs = parsed.body
        .split('\n\n')
        .filter(p => p.trim() && !p.startsWith('#'))
        .slice(0, 2); // Take first 2 paragraphs

      synthesizedContent += paragraphs.join('\n\n') + '\n\n';
    } catch (error) {
      // Skip sources that can't be read
      continue;
    }
  }

  return { body: synthesizedContent, sources };
}

/**
 * Handle evergreen-note tool call
 */
export async function handleEvergreenNote(
  context: ServerContext,
  args: EvergreenNoteInput
): Promise<ToolResponse<EvergreenNoteOutput>> {
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

    if (!args.title) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_TITLE',
          message: 'title parameter is required'
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

    const timestamp = new Date().toISOString();

    // Determine path
    let notePath: string;
    if (args.path) {
      notePath = args.path;
    } else {
      // Generate path from title
      const slug = args.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      notePath = `evergreen/${slug}.md`;
    }

    // Check if updating existing note
    const exists = await fileOps.fileExists(notePath);

    if (exists && !args.updateExisting) {
      return {
        status: 'error',
        error: {
          code: 'FILE_EXISTS',
          message: `File already exists: ${notePath}. Set updateExisting=true to update.`
        }
      };
    }

    let frontmatter: CanonicalFrontmatter;
    let body: string;
    let prevHash: string | undefined;
    let operation: 'create' | 'update';

    if (exists && args.updateExisting) {
      // Update existing note
      operation = 'update';
      const existingContent = await fileOps.readFile(notePath);
      const parsed = parseFrontmatter(existingContent);

      prevHash = computeHash(existingContent);

      frontmatter = {
        ...(parsed.frontmatter as CanonicalFrontmatter),
        updated: timestamp,
        type: 'evergreen',
        stage: 'synthesize',
        status: 'evergreen',
        confidence: 'high'
      };

      // Merge tags
      if (args.tags) {
        const existingTags = frontmatter.tags || [];
        frontmatter.tags = Array.from(new Set([...existingTags, ...args.tags]));
      }

      // Update body
      if (args.body) {
        body = args.body;
      } else if (args.sourceNotes && args.sourceNotes.length > 0) {
        const synthesized = await synthesizeFromSources(vault, args.sourceNotes);
        body = parsed.body + '\n\n## Synthesized Content\n\n' + synthesized.body;

        // Add sources
        const existingSources = frontmatter.sources || [];
        frontmatter.sources = Array.from(new Set([...existingSources, ...synthesized.sources]));
      } else {
        body = parsed.body;
      }
    } else {
      // Create new evergreen note
      operation = 'create';

      frontmatter = {
        type: 'evergreen',
        title: args.title,
        created: timestamp,
        updated: timestamp,
        stage: 'synthesize',
        status: 'evergreen',
        confidence: 'high',
        tags: args.tags || ['evergreen'],
        source: args.source
      };

      // Generate body
      if (args.body) {
        body = args.body;
      } else if (args.sourceNotes && args.sourceNotes.length > 0) {
        const synthesized = await synthesizeFromSources(vault, args.sourceNotes);
        frontmatter.sources = synthesized.sources;

        body = `# ${args.title}

## Summary

This evergreen note synthesizes insights from multiple atomic notes.

${synthesized.body}

## Related Notes

${synthesized.sources.map(s => `- [[${s}]]`).join('\n')}
`;
      } else {
        body = `# ${args.title}

## Summary

## Key Points

## Examples

## Related Notes
`;
      }
    }

    // Serialize and write
    let content = serializeFrontmatter(frontmatter as Record<string, any>, body);

    // Apply autoLint if requested
    if (args.autoLint) {
      const lintResult = await lintMarkdown(content, { applyFixes: true });
      if (lintResult.fixed) {
        content = lintResult.content;
      }
    }

    await fileOps.writeFile(notePath, content);

    // Record provenance
    const newHash = computeHash(content);
    context.db.recordHistory({
      vault: args.vault,
      path: notePath,
      timestamp,
      operation,
      tool: 'evergreen-note',
      actor: args.actor || 'llm',
      source: args.source,
      request_id: args.requestId,
      prev_hash: prevHash,
      new_hash: newHash
    });

    // Read back and return
    const finalContent = await fileOps.readFile(notePath);
    const finalParsed = parseFrontmatter(finalContent);

    return {
      status: 'ok',
      data: {
        note: {
          vault: args.vault,
          path: notePath,
          frontmatter: finalParsed.frontmatter,
          body: finalParsed.body,
          raw: finalContent
        },
        created: !exists,
        sourcesLinked: frontmatter.sources?.length || 0
      },
      meta: {
        tool: 'evergreen-note',
        vault: args.vault,
        requestId: args.requestId,
        timestamp
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'EVERGREEN_NOTE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
