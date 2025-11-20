/**
 * find-content-clusters tool implementation (§5.2.4)
 */

import { ServerContext } from '../server.js';
import { SearchResult, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { extractWikilinks } from '../search/regex-helpers.js';

export interface FindContentClustersInput {
  vault: string;
  minClusterSize?: number; // default 3
  maxClusters?: number;    // default 20
}

export interface ContentCluster {
  id: string;
  label?: string;
  notes: SearchResult[];
}

export interface FindContentClustersOutput {
  clusters: ContentCluster[];
}

/**
 * Simple clustering algorithm using Jaccard similarity of tags and links
 */
function clusterNotes(
  notes: Array<{ path: string; title: string; tags: Set<string>; links: Set<string> }>,
  minClusterSize: number,
  maxClusters: number
): ContentCluster[] {
  if (notes.length === 0) return [];

  // Calculate similarity matrix
  const similarity: number[][] = [];
  for (let i = 0; i < notes.length; i++) {
    similarity[i] = [];
    for (let j = 0; j < notes.length; j++) {
      if (i === j) {
        similarity[i][j] = 1.0;
      } else {
        const noteA = notes[i];
        const noteB = notes[j];

        // Jaccard similarity on tags
        const tagIntersection = new Set([...noteA.tags].filter(t => noteB.tags.has(t)));
        const tagUnion = new Set([...noteA.tags, ...noteB.tags]);
        const tagSim = tagUnion.size > 0 ? tagIntersection.size / tagUnion.size : 0;

        // Jaccard similarity on links
        const linkIntersection = new Set([...noteA.links].filter(l => noteB.links.has(l)));
        const linkUnion = new Set([...noteA.links, ...noteB.links]);
        const linkSim = linkUnion.size > 0 ? linkIntersection.size / linkUnion.size : 0;

        // Combined similarity (weighted average)
        similarity[i][j] = (tagSim * 0.6) + (linkSim * 0.4);
      }
    }
  }

  // Simple agglomerative clustering
  const clusters: number[][] = notes.map((_, i) => [i]);
  const threshold = 0.3; // Similarity threshold for merging

  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    let bestI = -1;
    let bestJ = -1;
    let bestSim = threshold;

    // Find best pair to merge
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average similarity between clusters
        let totalSim = 0;
        let count = 0;
        for (const ni of clusters[i]) {
          for (const nj of clusters[j]) {
            totalSim += similarity[ni][nj];
            count++;
          }
        }
        const avgSim = count > 0 ? totalSim / count : 0;

        if (avgSim > bestSim) {
          bestSim = avgSim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Merge best pair
    if (bestI >= 0 && bestJ >= 0) {
      clusters[bestI] = [...clusters[bestI], ...clusters[bestJ]];
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }

  // Filter by min size and sort by size
  const validClusters = clusters
    .filter(c => c.length >= minClusterSize)
    .sort((a, b) => b.length - a.length)
    .slice(0, maxClusters);

  // Convert to output format
  return validClusters.map((cluster, idx) => {
    const clusterNotes = cluster.map(i => notes[i]);

    // Generate label from most common tags
    const tagCounts = new Map<string, number>();
    for (const note of clusterNotes) {
      for (const tag of note.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => tag);

    const label = topTags.length > 0 ? topTags.join(', ') : `Cluster ${idx + 1}`;

    return {
      id: `cluster-${idx + 1}`,
      label,
      notes: clusterNotes.map(note => ({
        vault: '',
        path: note.path,
        title: note.title,
        score: 0,
        tags: Array.from(note.tags)
      }))
    };
  });
}

/**
 * Find content clusters in the vault
 */
export async function handleFindContentClusters(
  context: ServerContext,
  args: FindContentClustersInput
): Promise<ToolResponse<FindContentClustersOutput>> {
  try {
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const minClusterSize = args.minClusterSize ?? 3;
    const maxClusters = args.maxClusters ?? 20;

    // Get all notes
    const allFiles = await fileOps.listFiles();
    const mdFiles = allFiles.filter(f => f.type === 'file' && f.ext === '.md');

    // Extract features for clustering
    const noteData: Array<{ path: string; title: string; tags: Set<string>; links: Set<string> }> = [];

    for (const file of mdFiles) {
      try {
        const content = await fileOps.readFile(file.path);
        const parsed = parseFrontmatter(content);

        const tags = new Set<string>();
        if (Array.isArray(parsed.frontmatter?.tags)) {
          for (const tag of parsed.frontmatter.tags) {
            tags.add(String(tag).toLowerCase());
          }
        }

        const links = new Set<string>();
        const wikilinks = extractWikilinks(content);
        for (const link of wikilinks) {
          links.add(link.target.toLowerCase());
        }

        const title = parsed.frontmatter?.title || file.name.replace(/\.md$/, '');

        noteData.push({
          path: file.path,
          title: String(title),
          tags,
          links
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Cluster notes
    const clusters = clusterNotes(noteData, minClusterSize, maxClusters);

    // Add vault to all results
    for (const cluster of clusters) {
      for (const note of cluster.notes) {
        note.vault = args.vault;
      }
    }

    return {
      status: 'ok',
      data: {
        clusters
      },
      meta: {
        tool: 'find-content-clusters',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'CLUSTERING_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during clustering'
      }
    };
  }
}
