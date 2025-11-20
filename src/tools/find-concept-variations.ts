/**
 * find-concept-variations tool implementation
 */

import { ServerContext } from '../server.js';
import { Concept, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';

export interface FindConceptVariationsInput {
  vault: string;
  concept: string;
}

export interface FindConceptVariationsOutput {
  concept: Concept;
}

/**
 * Normalize concept term for matching
 */
function normalizeConcept(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Handle find-concept-variations tool call
 */
export async function handleFindConceptVariations(
  context: ServerContext,
  args: FindConceptVariationsInput
): Promise<ToolResponse<FindConceptVariationsOutput>> {
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
    validateVault(context.config, args.vault);

    // Normalize concept for lookup
    const normalized = normalizeConcept(args.concept);

    // Query concepts table for all variations with this normalized form
    const db = context.db.getRawDb();
    const rows = db
      .prepare('SELECT term, normalized, frequency FROM concepts WHERE normalized = ? ORDER BY frequency DESC')
      .all(normalized) as Array<{ term: string; normalized: string; frequency: number }>;

    if (rows.length === 0) {
      return {
        status: 'error',
        error: {
          code: 'CONCEPT_NOT_FOUND',
          message: `Concept not found: ${args.concept}`
        }
      };
    }

    // Aggregate frequency across all variations
    const totalFrequency = rows.reduce((sum, row) => sum + row.frequency, 0);

    // Collect all term variations
    const variants = rows.map(row => row.term);

    // Use most common variant as primary term
    const primaryTerm = rows[0].term;

    const concept: Concept = {
      term: primaryTerm,
      normalized,
      frequency: totalFrequency,
      variants
    };

    return {
      status: 'ok',
      data: {
        concept
      },
      meta: {
        tool: 'find-concept-variations',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'FIND_CONCEPT_VARIATIONS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
