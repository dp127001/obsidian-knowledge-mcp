/**
 * find-temporal-clusters tool implementation (§5.2.8)
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface FindTemporalClustersInput {
  vault: string;
  timeField?: 'created' | 'updated'; // default 'updated'
  windowDays?: number;               // default 7 days
  minClusterSize?: number;           // default 3
  maxClusters?: number;              // default 20
}

export interface TemporalCluster {
  id: string;
  startDate: string;               // ISO date
  endDate: string;                 // ISO date
  notes: SearchResult[];
  averageDate: string;             // ISO date
}

export interface FindTemporalClustersOutput {
  clusters: TemporalCluster[];
}

/**
 * Find clusters of notes grouped by temporal proximity
 *
 * Groups notes based on when they were created or updated,
 * revealing periods of focused work on related topics.
 */
export async function handleFindTemporalClusters(
  context: ServerContext,
  args: FindTemporalClustersInput
): Promise<ToolResponse<FindTemporalClustersOutput>> {
  try {
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const timeField = args.timeField ?? 'updated';
    const windowDays = args.windowDays ?? 7;
    const minClusterSize = args.minClusterSize ?? 3;
    const maxClusters = args.maxClusters ?? 20;

    // Get all notes with timestamps
    const allFiles = await fileOps.listFiles();
    const mdFiles = allFiles.filter(f => f.type === 'file' && f.ext === '.md');

    const notesWithDates: Array<{
      path: string;
      title: string;
      tags: string[];
      date: Date;
    }> = [];

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const parsed = parseFrontmatter(content);

        const dateValue = parsed.frontmatter?.[timeField];
        if (!dateValue) continue;

        const date = new Date(String(dateValue));
        if (isNaN(date.getTime())) continue;

        const title = parsed.frontmatter?.title || file.name.replace(/\.md$/, '');
        const tags = Array.isArray(parsed.frontmatter?.tags)
          ? parsed.frontmatter.tags.map(t => String(t))
          : [];

        notesWithDates.push({
          path: file.path,
          title: String(title),
          tags,
          date
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    if (notesWithDates.length === 0) {
      return {
        status: 'ok',
        data: {
          clusters: []
        },
        meta: {
          tool: 'find-temporal-clusters',
          vault: args.vault,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Sort by date
    notesWithDates.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Simple sliding window clustering
    const clusters: Array<typeof notesWithDates> = [];
    let currentCluster: typeof notesWithDates = [notesWithDates[0]];

    for (let i = 1; i < notesWithDates.length; i++) {
      const prevDate = notesWithDates[i - 1].date;
      const currDate = notesWithDates[i].date;
      const deltaDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      if (deltaDays <= windowDays) {
        // Same cluster
        currentCluster.push(notesWithDates[i]);
      } else {
        // Start new cluster
        if (currentCluster.length >= minClusterSize) {
          clusters.push(currentCluster);
        }
        currentCluster = [notesWithDates[i]];
      }
    }

    // Don't forget the last cluster
    if (currentCluster.length >= minClusterSize) {
      clusters.push(currentCluster);
    }

    // Sort by cluster size (largest first) and limit
    clusters.sort((a, b) => b.length - a.length);
    const limitedClusters = clusters.slice(0, maxClusters);

    // Convert to output format
    const result: TemporalCluster[] = limitedClusters.map((cluster, idx) => {
      const dates = cluster.map(n => n.date.getTime());
      const startDate = new Date(Math.min(...dates));
      const endDate = new Date(Math.max(...dates));
      const averageTimestamp = dates.reduce((a, b) => a + b, 0) / dates.length;
      const averageDate = new Date(averageTimestamp);

      return {
        id: `temporal-cluster-${idx + 1}`,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        averageDate: averageDate.toISOString(),
        notes: cluster.map(note => ({
          vault: args.vault,
          path: note.path,
          title: note.title,
          score: 0,
          tags: note.tags
        }))
      };
    });

    return {
      status: 'ok',
      data: {
        clusters: result
      },
      meta: {
        tool: 'find-temporal-clusters',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'TEMPORAL_CLUSTERING_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during temporal clustering'
      }
    };
  }
}
