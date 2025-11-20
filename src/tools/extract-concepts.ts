/**
 * extract-concepts tool implementation
 */

import { ServerContext } from '../server.js';
import { Concept, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface ExtractConceptsInput {
  vault: string;
  paths?: string[]; // Optional: specific paths to analyze
  persist?: boolean; // Optional: persist concepts to database (default: true)
}

export interface ExtractConceptsOutput {
  concepts: Concept[];
}

/**
 * Normalize concept term for matching
 */
function normalizeConcept(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

/**
 * Extract concepts from text using simple NLP heuristics
 */
function extractConceptsFromText(text: string): Map<string, number> {
  const concepts = new Map<string, number>();

  // Remove code blocks and frontmatter
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^---[\s\S]*?---/m, '');

  // Extract capitalized phrases (potential concepts)
  const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;

  while ((match = capitalizedRegex.exec(cleanText)) !== null) {
    const term = match[1];
    if (term.length > 2) { // Filter short terms
      const normalized = normalizeConcept(term);
      concepts.set(normalized, (concepts.get(normalized) || 0) + 1);
    }
  }

  // Extract hashtags as concepts
  const hashtagRegex = /#([\w/-]+)/g;
  while ((match = hashtagRegex.exec(cleanText)) !== null) {
    const term = match[1];
    const normalized = normalizeConcept(term);
    concepts.set(normalized, (concepts.get(normalized) || 0) + 1);
  }

  return concepts;
}

/**
 * Handle extract-concepts tool call
 */
export async function handleExtractConcepts(
  context: ServerContext,
  args: ExtractConceptsInput
): Promise<ToolResponse<ExtractConceptsOutput>> {
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

    // Build concept frequency map
    const conceptFrequency = new Map<string, {
      term: string;
      normalized: string;
      frequency: number;
      variants: Set<string>;
    }>();

    // Track concept-note relationships for persistence
    const conceptNoteLinks = new Map<string, Map<string, number>>(); // conceptId -> path -> score

    const fileOps = new FileOperations(vault.path);

    // Get files to analyze
    let filePaths: string[];
    if (args.paths && args.paths.length > 0) {
      filePaths = args.paths;
    } else {
      const files = await fileOps.listFiles('', {
        recursive: true,
        notesOnly: true,
        includeMetadata: false
      });
      filePaths = files.filter(f => f.type === 'file').map(f => f.path);
    }

    // Process each file
    for (const filePath of filePaths) {
      try {
        const content = await fileOps.readFile(filePath);
        const parsed = parseFrontmatter(content);

        // Extract concepts from body
        const concepts = extractConceptsFromText(parsed.body);

        for (const [normalized, count] of concepts.entries()) {
          if (!conceptFrequency.has(normalized)) {
            conceptFrequency.set(normalized, {
              term: normalized, // Will be updated with best variant
              normalized,
              frequency: 0,
              variants: new Set()
            });
          }

          const entry = conceptFrequency.get(normalized)!;
          entry.frequency += count;
          entry.variants.add(normalized);

          // Track concept-note link
          if (!conceptNoteLinks.has(normalized)) {
            conceptNoteLinks.set(normalized, new Map());
          }
          conceptNoteLinks.get(normalized)!.set(filePath, count);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Convert to Concept array and sort by frequency
    const concepts: Concept[] = Array.from(conceptFrequency.values())
      .map(entry => ({
        term: entry.term,
        normalized: entry.normalized,
        frequency: entry.frequency,
        variants: Array.from(entry.variants)
      }))
      .sort((a, b) => b.frequency - a.frequency);

    // Persist to database if requested (default: true)
    const shouldPersist = args.persist !== false;
    if (shouldPersist) {
      // If analyzing entire vault (no specific paths), clear existing concept links
      if (!args.paths || args.paths.length === 0) {
        context.db.clearConceptNotesForVault(args.vault);
      }

      // Persist concepts and their relationships to notes
      for (const concept of concepts) {
        const conceptId = `concept-${concept.normalized}`;

        // Upsert concept
        context.db.upsertConcept(
          conceptId,
          concept.term,
          concept.normalized,
          concept.frequency
        );

        // Link concept to notes
        const noteLinks = conceptNoteLinks.get(concept.normalized);
        if (noteLinks) {
          for (const [notePath, score] of noteLinks.entries()) {
            context.db.linkConceptToNote(conceptId, args.vault, notePath, score);
          }
        }
      }
    }

    return {
      status: 'ok',
      data: {
        concepts
      },
      meta: {
        tool: 'extract-concepts',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'EXTRACT_CONCEPTS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
