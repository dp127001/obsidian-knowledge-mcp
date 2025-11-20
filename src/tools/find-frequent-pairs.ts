/**
 * find-frequent-pairs tool implementation (§5.2.5)
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { extractWikilinks } from '../search/regex-helpers.js';

export interface FindFrequentPairsInput {
  vault: string;
  minCoCitationCount?: number; // default 2
  limit?: number;              // default 20
}

export interface NotePair {
  a: SearchResult;
  b: SearchResult;
  coCitationCount: number;
  score: number;
}

export interface FindFrequentPairsOutput {
  pairs: NotePair[];
}

/**
 * Find frequently co-cited note pairs
 *
 * Two notes are co-cited when they both appear as links in the same note.
 * This tool identifies note pairs that are frequently referenced together,
 * which may indicate conceptual relationships.
 */
export async function handleFindFrequentPairs(
  context: ServerContext,
  args: FindFrequentPairsInput
): Promise<ToolResponse<FindFrequentPairsOutput>> {
  try {
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const minCoCitationCount = args.minCoCitationCount ?? 2;
    const limit = args.limit ?? 20;

    // Get all notes and their links
    const allFiles = await fileOps.listFiles();
    const mdFiles = allFiles.filter(f => f.type === 'file' && f.ext === '.md');

    // Build co-citation matrix
    const coCitationCounts = new Map<string, number>();

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const links = extractWikilinks(content);

        // Normalize and dedupe links
        const normalizedLinks = Array.from(new Set(
          links.map(l => l.target.toLowerCase().replace(/\.md$/i, ''))
        ));

        // Count all pairs in this note
        for (let i = 0; i < normalizedLinks.length; i++) {
          for (let j = i + 1; j < normalizedLinks.length; j++) {
            const [a, b] = [normalizedLinks[i], normalizedLinks[j]].sort();
            const pairKey = `${a}|||${b}`;
            coCitationCounts.set(pairKey, (coCitationCounts.get(pairKey) || 0) + 1);
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Filter and sort pairs
    const pairs = Array.from(coCitationCounts.entries())
      .filter(([, count]) => count >= minCoCitationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

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

    // Convert to output format
    const result: NotePair[] = [];

    for (const [pairKey, count] of pairs) {
      const [aKey, bKey] = pairKey.split('|||');
      const aMeta = noteMetadata.get(aKey);
      const bMeta = noteMetadata.get(bKey);

      if (!aMeta || !bMeta) continue;

      // Score is co-citation count (could be normalized)
      const score = count;

      result.push({
        a: {
          vault: args.vault,
          path: aMeta.path,
          title: aMeta.title,
          score,
          tags: aMeta.tags
        },
        b: {
          vault: args.vault,
          path: bMeta.path,
          title: bMeta.title,
          score,
          tags: bMeta.tags
        },
        coCitationCount: count,
        score
      });
    }

    return {
      status: 'ok',
      data: {
        pairs: result
      },
      meta: {
        tool: 'find-frequent-pairs',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'PAIR_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during pair analysis'
      }
    };
  }
}
