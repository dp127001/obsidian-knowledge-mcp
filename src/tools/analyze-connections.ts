/**
 * analyze-connections tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { extractWikilinks } from '../search/regex-helpers.js';
import { buildSearchIndex } from '../search/index-builder.js';

export interface AnalyzeConnectionsInput {
  vault: string;
  paths?: string[];  // Optional: analyze specific notes
  limitSuggestions?: number; // Max suggestions per note (default: 5)
}

export interface ConnectionSuggestion {
  from: NoteRef;
  to: NoteRef;
  score: number;
  reasons: string[];
}

export interface AnalyzeConnectionsOutput {
  suggestions: ConnectionSuggestion[];
}

/**
 * Calculate similarity score between two notes
 */
function calculateSimilarity(
  note1: {
    tags: string[];
    content: string;
    links: string[];
  },
  note2: {
    tags: string[];
    content: string;
    links: string[];
  }
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Shared tags
  const sharedTags = note1.tags.filter(t => note2.tags.includes(t));
  if (sharedTags.length > 0) {
    score += sharedTags.length * 0.3;
    reasons.push(`${sharedTags.length} shared tags`);
  }

  // Mutual links (both link to same notes)
  const sharedLinks = note1.links.filter(l => note2.links.includes(l));
  if (sharedLinks.length > 0) {
    score += sharedLinks.length * 0.4;
    reasons.push(`${sharedLinks.length} shared link targets`);
  }

  // Content similarity (simple word overlap)
  const words1 = new Set(
    note1.content
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
  );
  const words2 = new Set(
    note2.content
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
  );

  const commonWords = new Set([...words1].filter(w => words2.has(w)));
  const similarity = commonWords.size / Math.min(words1.size, words2.size);

  if (similarity > 0.1) {
    score += similarity * 0.3;
    reasons.push('high content similarity');
  }

  return { score, reasons };
}

/**
 * Handle analyze-connections tool call
 */
export async function handleAnalyzeConnections(
  context: ServerContext,
  args: AnalyzeConnectionsInput
): Promise<ToolResponse<AnalyzeConnectionsOutput>> {
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

    // Build search index
    const entries = await buildSearchIndex(vault);

    const fileOps = new FileOperations(vault.path);

    // Build note data with links
    const noteData = new Map<string, {
      ref: NoteRef;
      tags: string[];
      content: string;
      links: string[];
      existingLinks: Set<string>;
    }>();

    // Get target paths
    const targetPaths = args.paths || entries.map(e => e.path);

    for (const entry of entries) {
      try {
        const content = await fileOps.readFile(entry.path);
        const links = extractWikilinks(content);

        noteData.set(entry.path, {
          ref: { vault: entry.vault, path: entry.path },
          tags: entry.tags,
          content: entry.content,
          links: links.map(l => l.target),
          existingLinks: new Set(links.map(l => l.target))
        });
      } catch (error) {
        continue;
      }
    }

    // Generate connection suggestions
    const suggestions: ConnectionSuggestion[] = [];
    const limitPerNote = args.limitSuggestions || 5;

    for (const path of targetPaths) {
      const note1Data = noteData.get(path);
      if (!note1Data) continue;

      const candidates: Array<{ note: string; score: number; reasons: string[] }> = [];

      for (const [otherPath, note2Data] of noteData.entries()) {
        if (otherPath === path) continue;

        // Skip if already linked
        if (note1Data.existingLinks.has(otherPath) ||
            note2Data.existingLinks.has(path)) {
          continue;
        }

        const similarity = calculateSimilarity(
          {
            tags: note1Data.tags,
            content: note1Data.content,
            links: note1Data.links
          },
          {
            tags: note2Data.tags,
            content: note2Data.content,
            links: note2Data.links
          }
        );

        if (similarity.score > 0.2) {
          candidates.push({
            note: otherPath,
            score: similarity.score,
            reasons: similarity.reasons
          });
        }
      }

      // Sort by score and take top N
      candidates.sort((a, b) => b.score - a.score);
      const topCandidates = candidates.slice(0, limitPerNote);

      for (const candidate of topCandidates) {
        const note2Data = noteData.get(candidate.note)!;
        suggestions.push({
          from: note1Data.ref,
          to: note2Data.ref,
          score: candidate.score,
          reasons: candidate.reasons
        });
      }
    }

    // Sort all suggestions by score
    suggestions.sort((a, b) => b.score - a.score);

    return {
      status: 'ok',
      data: {
        suggestions
      },
      meta: {
        tool: 'analyze-connections',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'ANALYZE_CONNECTIONS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
