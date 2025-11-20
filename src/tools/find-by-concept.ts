/**
 * find-by-concept tool implementation
 */

import { ServerContext } from '../server.js';
import { SearchResult, Concept, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface FindByConceptInput {
  vault: string;
  concept: string;
  limit?: number;
}

export interface FindByConceptOutput {
  concept: Concept;
  notes: SearchResult[];
}

/**
 * Normalize concept term for matching
 */
function normalizeConcept(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Handle find-by-concept tool call
 */
export async function handleFindByConcept(
  context: ServerContext,
  args: FindByConceptInput
): Promise<ToolResponse<FindByConceptOutput>> {
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

    if (!args.concept) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_CONCEPT',
          message: 'concept parameter is required'
        }
      };
    }

    // Validate vault
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Normalize concept for lookup
    const normalized = normalizeConcept(args.concept);

    // Query concepts table
    const db = context.db.getRawDb();
    const conceptRow = db
      .prepare('SELECT concept_id, term, normalized, frequency FROM concepts WHERE normalized = ? LIMIT 1')
      .get(normalized) as { concept_id: string; term: string; normalized: string; frequency: number } | undefined;

    if (!conceptRow) {
      return {
        status: 'error',
        error: {
          code: 'CONCEPT_NOT_FOUND',
          message: `Concept not found: ${args.concept}`
        }
      };
    }

    // Build concept object
    const concept: Concept = {
      term: conceptRow.term,
      normalized: conceptRow.normalized,
      frequency: conceptRow.frequency
    };

    // Query concept_notes table
    const limit = args.limit || 50;
    const noteRows = db
      .prepare(`
        SELECT vault, path, score
        FROM concept_notes
        WHERE concept_id = ? AND vault = ?
        ORDER BY score DESC
        LIMIT ?
      `)
      .all(conceptRow.concept_id, args.vault, limit) as Array<{
        vault: string;
        path: string;
        score: number;
      }>;

    // Load note metadata
    const notes: SearchResult[] = [];

    for (const row of noteRows) {
      try {
        const content = await fileOps.readFile(row.path);
        const parsed = parseFrontmatter(content);
        const frontmatter = parsed.frontmatter || {};
        const title = frontmatter.title || row.path.replace(/\.md$/, '').split('/').pop() || row.path;

        notes.push({
          vault: row.vault,
          path: row.path,
          title,
          score: row.score,
          tags: frontmatter.tags,
          frontmatter
        });
      } catch (error) {
        // Skip files that fail to read
        continue;
      }
    }

    return {
      status: 'ok',
      data: {
        concept,
        notes
      },
      meta: {
        tool: 'find-by-concept',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'FIND_BY_CONCEPT_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
