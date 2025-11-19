/**
 * fuzzy-search tool implementation
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { buildSearchIndex } from '../search/index-builder.js';
import { createSearchEngine } from '../search/engine.js';

export interface FuzzySearchInput {
  vault: string;
  query: string;
  searchIn?: ('content' | 'frontmatter' | 'tags' | 'filename')[];
  limit?: number;
  offset?: number;
  fuzzyThreshold?: number; // 0..1
}

export interface FuzzySearchOutput {
  results: SearchResult[];
  totalEstimate?: number;
}

/**
 * Handle fuzzy-search tool call
 */
export async function handleFuzzySearch(
  context: ServerContext,
  args: FuzzySearchInput
): Promise<ToolResponse<FuzzySearchOutput>> {
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

    if (!args.query) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_QUERY',
          message: 'query parameter is required'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);

    // Build search index
    const entries = await buildSearchIndex(vault);

    // Create search engine
    const engine = createSearchEngine({
      fuzzyThreshold: args.fuzzyThreshold ?? context.config.search?.fuzzyThreshold,
      maxResults: args.limit || 20
    });

    // Determine search strategy based on searchIn
    const searchIn = args.searchIn || ['content'];
    let allResults: SearchResult[];

    if (searchIn.length === 1 && searchIn[0] === 'filename') {
      // Filename-only search uses fuzzysort
      allResults = engine.searchFuzzyPaths(entries, args.query);
    } else if (searchIn.every(s => s === 'content' || s === 'tags')) {
      // Content/tags search uses uFuzzy
      const fields = searchIn.filter(s => s === 'content' || s === 'tags') as ('content' | 'tags')[];
      allResults = engine.searchFuzzyContent(entries, args.query, fields);
    } else {
      // Mixed search: combine both
      const contentFields = searchIn.filter(s => s === 'content' || s === 'tags') as ('content' | 'tags')[];
      const contentResults = contentFields.length > 0
        ? engine.searchFuzzyContent(entries, args.query, contentFields)
        : [];

      const pathResults = searchIn.includes('filename')
        ? engine.searchFuzzyPaths(entries, args.query)
        : [];

      // Merge and deduplicate
      const mergedMap = new Map<string, SearchResult>();
      for (const result of [...contentResults, ...pathResults]) {
        const key = `${result.vault}:${result.path}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, result);
        }
      }

      allResults = Array.from(mergedMap.values());
      allResults.sort((a, b) => b.score - a.score);
    }

    // Apply pagination
    const offset = args.offset || 0;
    const limit = args.limit || 20;
    const results = allResults.slice(offset, offset + limit);

    return {
      status: 'ok',
      data: {
        results,
        totalEstimate: allResults.length
      },
      meta: {
        tool: 'fuzzy-search',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'FUZZY_SEARCH_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
