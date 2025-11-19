/**
 * find-broken-links tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, SearchResult, ToolResponse, Pagination } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { extractWikilinks } from '../search/regex-helpers.js';
import { buildSearchIndex } from '../search/index-builder.js';
import { createSearchEngine } from '../search/engine.js';
import * as path from 'path';

export interface FindBrokenLinksInput {
  vault: string;
  limit?: number;
  offset?: number;
}

export interface BrokenLink {
  source: NoteRef;
  linkText: string;
  linkRaw: string;
  suggestions: SearchResult[];
}

export interface FindBrokenLinksOutput {
  brokenLinks: BrokenLink[];
  pagination: Pagination;
}

/**
 * Resolve wikilink target to actual file path
 */
function resolveWikilinkTarget(
  target: string,
  availableFiles: Set<string>
): string | null {
  // Try exact match
  if (availableFiles.has(`${target}.md`)) {
    return `${target}.md`;
  }

  // Try case-insensitive match
  const lowerTarget = target.toLowerCase();
  for (const file of availableFiles) {
    if (file.toLowerCase() === `${lowerTarget}.md`) {
      return file;
    }
  }

  // Try basename match
  const targetBasename = path.basename(target);
  for (const file of availableFiles) {
    if (path.basename(file, '.md') === targetBasename) {
      return file;
    }
  }

  return null;
}

/**
 * Handle find-broken-links tool call
 */
export async function handleFindBrokenLinks(
  context: ServerContext,
  args: FindBrokenLinksInput
): Promise<ToolResponse<FindBrokenLinksOutput>> {
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

    // List all files
    const fileOps = new FileOperations(vault.path);
    const files = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: false
    });

    // Build set of available files
    const availableFiles = new Set(files.map(f => f.path));

    // Build search index for suggestions
    const searchEntries = await buildSearchIndex(vault);
    const engine = createSearchEngine();

    // Find broken links
    const allBrokenLinks: BrokenLink[] = [];

    for (const file of files) {
      if (file.type !== 'file') continue;

      try {
        const content = await fileOps.readFile(file.path);
        const links = extractWikilinks(content);

        for (const link of links) {
          // Skip embed links for now
          if (link.isEmbed) continue;

          // Try to resolve the link
          const resolved = resolveWikilinkTarget(link.target, availableFiles);

          if (!resolved) {
            // Link is broken - get suggestions
            const suggestions = engine.suggestLinkTargets(
              searchEntries,
              link.target,
              5
            );

            allBrokenLinks.push({
              source: {
                vault: args.vault,
                path: file.path
              },
              linkText: link.target,
              linkRaw: link.raw,
              suggestions
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Apply pagination
    const offset = args.offset || 0;
    const limit = args.limit || 20;
    const brokenLinks = allBrokenLinks.slice(offset, offset + limit);

    return {
      status: 'ok',
      data: {
        brokenLinks,
        pagination: {
          limit,
          offset,
          total: allBrokenLinks.length
        }
      },
      meta: {
        tool: 'find-broken-links',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'FIND_BROKEN_LINKS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
