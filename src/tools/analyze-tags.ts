/**
 * analyze-tags tool implementation
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { buildSearchIndex } from '../search/index-builder.js';

export interface AnalyzeTagsInput {
  vault: string;
  minCount?: number; // Minimum tag count to include (default: 1)
}

export interface TagStats {
  tag: string;
  count: number;
  notes: SearchResult[];
}

export interface AnalyzeTagsOutput {
  tags: TagStats[];
  totalTags: number;
  totalNotes: number;
}

/**
 * Handle analyze-tags tool call
 */
export async function handleAnalyzeTags(
  context: ServerContext,
  args: AnalyzeTagsInput
): Promise<ToolResponse<AnalyzeTagsOutput>> {
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

    // Build tag frequency map
    const tagMap = new Map<string, SearchResult[]>();

    for (const entry of entries) {
      for (const tag of entry.tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }

        tagMap.get(tag)!.push({
          vault: entry.vault,
          path: entry.path,
          title: entry.title,
          score: 1.0,
          tags: entry.tags,
          frontmatter: entry.frontmatter || undefined
        });
      }
    }

    // Convert to TagStats array
    const minCount = args.minCount || 1;
    const tags: TagStats[] = Array.from(tagMap.entries())
      .map(([tag, notes]) => ({
        tag,
        count: notes.length,
        notes
      }))
      .filter(stats => stats.count >= minCount)
      .sort((a, b) => b.count - a.count);

    return {
      status: 'ok',
      data: {
        tags,
        totalTags: tags.length,
        totalNotes: entries.length
      },
      meta: {
        tool: 'analyze-tags',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'ANALYZE_TAGS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
