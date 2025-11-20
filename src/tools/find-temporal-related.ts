/**
 * find-temporal-related tool implementation (§5.2.8)
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface FindTemporalRelatedInput {
  vault: string;
  path: string;                // Anchor note
  windowDays?: number;         // default 7 days
  limit?: number;              // default 20
}

export interface TemporallyRelatedNote extends SearchResult {
  timeDeltaDays: number;       // Days from anchor
  relationshipType: 'created-same-time' | 'updated-same-time' | 'both';
}

export interface FindTemporalRelatedOutput {
  anchor: { vault: string; path: string; title: string; created?: string; updated?: string };
  relatedNotes: TemporallyRelatedNote[];
}

/**
 * Find notes temporally related to an anchor note
 *
 * Notes are temporally related if they were created or modified
 * within a time window of each other. This can reveal conceptual
 * connections based on when work was happening.
 */
export async function handleFindTemporalRelated(
  context: ServerContext,
  args: FindTemporalRelatedInput
): Promise<ToolResponse<FindTemporalRelatedOutput>> {
  try {
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const windowDays = args.windowDays ?? 7;
    const limit = args.limit ?? 20;

    // Get anchor note
    const anchorContent = await fileOps.readFile(args.path);
    const anchorParsed = parseFrontmatter(anchorContent);
    const anchorTitle = anchorParsed.frontmatter?.title || args.path.replace(/\.md$/, '');

    // Get anchor dates
    const anchorCreated = anchorParsed.frontmatter?.created
      ? new Date(String(anchorParsed.frontmatter.created))
      : undefined;
    const anchorUpdated = anchorParsed.frontmatter?.updated
      ? new Date(String(anchorParsed.frontmatter.updated))
      : undefined;

    if (!anchorCreated && !anchorUpdated) {
      return {
        status: 'error',
        error: {
          code: 'NO_TEMPORAL_DATA',
          message: 'Anchor note has no created or updated dates in frontmatter'
        }
      };
    }

    // Get all notes
    const allFiles = await fileOps.listFiles();
    const mdFiles = allFiles.filter(f => f.type === 'file' && f.ext === '.md' && f.path !== args.path);

    // Find temporally related notes
    const relatedNotes: TemporallyRelatedNote[] = [];

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const parsed = parseFrontmatter(content);

        const created = parsed.frontmatter?.created
          ? new Date(String(parsed.frontmatter.created))
          : undefined;
        const updated = parsed.frontmatter?.updated
          ? new Date(String(parsed.frontmatter.updated))
          : undefined;

        let relationshipType: 'created-same-time' | 'updated-same-time' | 'both' | null = null;
        let minDelta = Infinity;

        // Check created proximity
        if (anchorCreated && created) {
          const deltaDays = Math.abs(anchorCreated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          if (deltaDays <= windowDays) {
            relationshipType = 'created-same-time';
            minDelta = Math.min(minDelta, deltaDays);
          }
        }

        // Check updated proximity
        if (anchorUpdated && updated) {
          const deltaDays = Math.abs(anchorUpdated.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
          if (deltaDays <= windowDays) {
            if (relationshipType === 'created-same-time') {
              relationshipType = 'both';
            } else {
              relationshipType = 'updated-same-time';
            }
            minDelta = Math.min(minDelta, deltaDays);
          }
        }

        if (relationshipType) {
          const title = parsed.frontmatter?.title || file.name.replace(/\.md$/, '');
          const tags = Array.isArray(parsed.frontmatter?.tags)
            ? parsed.frontmatter.tags.map(t => String(t))
            : [];

          relatedNotes.push({
            vault: args.vault,
            path: file.path,
            title: String(title),
            score: 1.0 / (1.0 + minDelta), // Closer in time = higher score
            tags,
            timeDeltaDays: Math.round(minDelta * 10) / 10,
            relationshipType
          });
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Sort by score (closest in time first) and limit
    relatedNotes.sort((a, b) => b.score - a.score);
    const limitedNotes = relatedNotes.slice(0, limit);

    return {
      status: 'ok',
      data: {
        anchor: {
          vault: args.vault,
          path: args.path,
          title: String(anchorTitle),
          created: anchorCreated?.toISOString(),
          updated: anchorUpdated?.toISOString()
        },
        relatedNotes: limitedNotes
      },
      meta: {
        tool: 'find-temporal-related',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'TEMPORAL_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during temporal analysis'
      }
    };
  }
}
