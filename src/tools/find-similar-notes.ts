/**
 * find-similar-notes tool implementation
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface SimilarNote extends SearchResult {
  sharedTerms?: string[];
  similarity: {
    tagOverlap: number;
    conceptOverlap: number;
    termOverlap: number;
    overall: number;
  };
}

export interface FindSimilarNotesInput {
  vault: string;
  path: string;
  limit?: number;
  includeSharedTerms?: boolean;
}

export interface FindSimilarNotesOutput {
  anchor: {
    vault: string;
    path: string;
    title: string;
  };
  results: SimilarNote[];
}

/**
 * Extract significant terms from text (simple word frequency)
 */
function extractTerms(text: string, minLength: number = 4): Map<string, number> {
  const terms = new Map<string, number>();

  // Simple tokenization
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= minLength);

  for (const word of words) {
    terms.set(word, (terms.get(word) || 0) + 1);
  }

  return terms;
}

/**
 * Compute Jaccard similarity between two sets
 */
function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Compute cosine similarity between term frequency maps
 */
function cosineSimilarity(termsA: Map<string, number>, termsB: Map<string, number>): number {
  const allTerms = new Set([...termsA.keys(), ...termsB.keys()]);

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const term of allTerms) {
    const freqA = termsA.get(term) || 0;
    const freqB = termsB.get(term) || 0;

    dotProduct += freqA * freqB;
    magnitudeA += freqA * freqA;
    magnitudeB += freqB * freqB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * Handle find-similar-notes tool call
 */
export async function handleFindSimilarNotes(
  context: ServerContext,
  args: FindSimilarNotesInput
): Promise<ToolResponse<FindSimilarNotesOutput>> {
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

    // Validate vault
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Check if anchor note exists
    const exists = await fileOps.fileExists(args.path);
    if (!exists) {
      return {
        status: 'error',
        error: {
          code: 'FILE_NOT_FOUND',
          message: `Anchor note not found: ${args.path}`
        }
      };
    }

    // Read anchor note
    const anchorContent = await fileOps.readFile(args.path);
    const anchorParsed = parseFrontmatter(anchorContent);
    const anchorFrontmatter = anchorParsed.frontmatter || {};
    const anchorTitle = anchorFrontmatter.title || args.path.replace(/\.md$/, '').split('/').pop() || args.path;

    // Extract anchor features
    const anchorTags = new Set<string>(
      Array.isArray(anchorFrontmatter.tags) ? anchorFrontmatter.tags :
      anchorFrontmatter.tags ? [anchorFrontmatter.tags] : []
    );

    // Get anchor concepts from database
    const anchorConcepts = new Set<string>();
    const db = context.db.getRawDb();
    const conceptRows = db
      .prepare('SELECT concept_id FROM concept_notes WHERE vault = ? AND path = ?')
      .all(args.vault, args.path) as Array<{ concept_id: string }>;

    for (const row of conceptRows) {
      anchorConcepts.add(row.concept_id);
    }

    // Extract terms from anchor content
    const anchorTerms = extractTerms(anchorParsed.body);

    // Get all notes in vault
    const allFiles = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: false
    });

    // Compute similarity for each note
    const similarities: SimilarNote[] = [];

    for (const file of allFiles) {
      // Skip anchor note itself
      if (file.path === args.path) continue;

      try {
        const content = await fileOps.readFile(file.path);
        const parsed = parseFrontmatter(content);
        const frontmatter = parsed.frontmatter || {};
        const title = frontmatter.title || file.name.replace(/\.md$/, '');

        // Extract features
        const tags = new Set<string>(
          Array.isArray(frontmatter.tags) ? frontmatter.tags :
          frontmatter.tags ? [frontmatter.tags] : []
        );

        // Get concepts
        const concepts = new Set<string>();
        const noteConceptRows = db
          .prepare('SELECT concept_id FROM concept_notes WHERE vault = ? AND path = ?')
          .all(args.vault, file.path) as Array<{ concept_id: string }>;

        for (const row of noteConceptRows) {
          concepts.add(row.concept_id);
        }

        // Extract terms
        const terms = extractTerms(parsed.body);

        // Compute similarities
        const tagOverlap = jaccardSimilarity(anchorTags, tags);
        const conceptOverlap = jaccardSimilarity(anchorConcepts, concepts);
        const termOverlap = cosineSimilarity(anchorTerms, terms);

        // Overall similarity (weighted average)
        const overall = (tagOverlap * 0.3) + (conceptOverlap * 0.4) + (termOverlap * 0.3);

        // Only include if similarity > 0
        if (overall > 0) {
          // Find shared terms
          let sharedTerms: string[] | undefined;
          if (args.includeSharedTerms) {
            sharedTerms = [...anchorTerms.keys()]
              .filter(term => terms.has(term))
              .sort((a, b) => (terms.get(b) || 0) - (terms.get(a) || 0))
              .slice(0, 10); // Top 10 shared terms
          }

          similarities.push({
            vault: args.vault,
            path: file.path,
            title,
            score: overall,
            tags: frontmatter.tags,
            frontmatter,
            sharedTerms,
            similarity: {
              tagOverlap,
              conceptOverlap,
              termOverlap,
              overall
            }
          });
        }
      } catch (error) {
        // Skip files that fail to parse
        continue;
      }
    }

    // Sort by overall similarity (descending)
    similarities.sort((a, b) => b.similarity.overall - a.similarity.overall);

    // Apply limit
    const limit = args.limit || 10;
    const results = similarities.slice(0, limit);

    return {
      status: 'ok',
      data: {
        anchor: {
          vault: args.vault,
          path: args.path,
          title: anchorTitle
        },
        results
      },
      meta: {
        tool: 'find-similar-notes',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'FIND_SIMILAR_NOTES_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
