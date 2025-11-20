/**
 * find-co-citation tool implementation (§5.2.5)
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { extractWikilinks } from '../search/regex-helpers.js';

export interface FindCoCitationInput {
  vault: string;
  path: string;                // Anchor note to find co-citations for
  minCoCitationCount?: number; // default 2
  limit?: number;              // default 20
}

export interface CoCitation {
  note: SearchResult;
  coCitationCount: number;
  score: number;
  coCitingSources: string[];   // Paths of notes that cite both
}

export interface FindCoCitationOutput {
  anchor: { vault: string; path: string; title: string };
  coCitations: CoCitation[];
}

/**
 * Find notes that are frequently co-cited with a given note
 *
 * Given an anchor note, finds other notes that appear alongside it
 * in the same source notes. This reveals conceptual relationships
 * through citation patterns.
 */
export async function handleFindCoCitation(
  context: ServerContext,
  args: FindCoCitationInput
): Promise<ToolResponse<FindCoCitationOutput>> {
  try {
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const minCoCitationCount = args.minCoCitationCount ?? 2;
    const limit = args.limit ?? 20;

    // Normalize anchor path
    const anchorNormalized = args.path.toLowerCase().replace(/\.md$/i, '');

    // Get anchor note metadata
    const anchorContent = await fileOps.readFile(args.path);
    const anchorParsed = parseFrontmatter(anchorContent);
    const anchorTitle = anchorParsed.frontmatter?.title || args.path.replace(/\.md$/, '');

    // Get all notes and their links
    const allFiles = await fileOps.listFiles();
    const mdFiles = allFiles.filter(f => f.type === 'file' && f.ext === '.md');

    // Find notes that cite the anchor
    const coCitationCounts = new Map<string, { count: number; sources: string[] }>();

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const links = extractWikilinks(content);

        // Normalize links
        const normalizedLinks = links.map(l => l.target.toLowerCase().replace(/\.md$/i, ''));

        // Check if this note cites the anchor
        const citesAnchor = normalizedLinks.some(l => l === anchorNormalized);

        if (citesAnchor) {
          // Track all other notes cited alongside the anchor
          for (const link of normalizedLinks) {
            if (link !== anchorNormalized) {
              const existing = coCitationCounts.get(link) || { count: 0, sources: [] };
              existing.count++;
              existing.sources.push(file.path);
              coCitationCounts.set(link, existing);
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Build note metadata map
    const noteMetadata = new Map<string, { title: string; tags: string[]; path: string }>();

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const parsed = parseFrontmatter(content);

        const normalizedPath = file.path.toLowerCase().replace(/\.md$/i, '');
        const title = parsed.frontmatter?.title || file.name.replace(/\.md$/, '');
        const tags = Array.isArray(parsed.frontmatter?.tags)
          ? parsed.frontmatter.tags.map(t => String(t))
          : [];

        noteMetadata.set(normalizedPath, {
          title: String(title),
          tags,
          path: file.path
        });
      } catch (error) {
        // Skip
      }
    }

    // Filter and sort co-citations
    const coCitations: CoCitation[] = Array.from(coCitationCounts.entries())
      .filter(([, data]) => data.count >= minCoCitationCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([noteKey, data]) => {
        const meta = noteMetadata.get(noteKey);
        if (!meta) return null;

        const coCitation: CoCitation = {
          note: {
            vault: args.vault,
            path: meta.path,
            title: meta.title,
            score: data.count,
            tags: meta.tags
          },
          coCitationCount: data.count,
          score: data.count,
          coCitingSources: data.sources
        };
        return coCitation;
      })
      .filter((item): item is CoCitation => item !== null);

    return {
      status: 'ok',
      data: {
        anchor: {
          vault: args.vault,
          path: args.path,
          title: String(anchorTitle)
        },
        coCitations
      },
      meta: {
        tool: 'find-co-citation',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'CO_CITATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during co-citation analysis'
      }
    };
  }
}
