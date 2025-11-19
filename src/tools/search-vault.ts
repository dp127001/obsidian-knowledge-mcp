/**
 * search-vault tool implementation
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { buildSearchIndex } from '../search/index-builder.js';
import { createSearchEngine } from '../search/engine.js';

export interface SearchVaultInput {
  vault: string;
  query: string;
  searchIn?: ('content' | 'frontmatter' | 'tags' | 'filename')[];
  limit?: number;
  offset?: number;
}

export interface SearchVaultOutput {
  results: SearchResult[];
  totalEstimate?: number;
}

/**
 * Handle search-vault tool call
 */
export async function handleSearchVault(
  context: ServerContext,
  args: SearchVaultInput
): Promise<ToolResponse<SearchVaultOutput>> {
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
      fuzzyThreshold: context.config.search?.fuzzyThreshold,
      maxResults: args.limit || 20
    });

    // Perform hybrid search
    const searchIn = args.searchIn || ['content'];
    const allResults = engine.searchHybrid(entries, args.query, searchIn);

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
        tool: 'search-vault',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'SEARCH_VAULT_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
