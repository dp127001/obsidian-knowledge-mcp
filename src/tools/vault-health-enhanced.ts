/**
 * vault-health-enhanced tool implementation
 * Comprehensive vault health metrics and diagnostics
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { extractWikilinks } from '../search/regex-helpers.js';
import { lintMarkdown } from '../linter/engine.js';

export interface VaultHealthEnhancedInput {
  vault: string;
  sampleLintHygiene?: boolean; // Sample notes for lint issues (default: false)
  lintSampleSize?: number; // Number of notes to sample for linting (default: 20)
}

export interface TypeCounts {
  atomic: number;
  evergreen: number;
  decision: number;
  project: number;
  framework: number;
  journal: number;
  untyped: number;
}

/**
 * Vault health statistics matching spec §5.6.4
 */
export interface VaultHealthStats {
  totalNotes: number;
  atomicNotes: number;
  evergreenNotes: number;
  decisionLogs: number;
  trueOrphans: number;          // Orphans excluding atomics
  orphanPercentage: number;     // Percentage of non-atomic notes that are orphans
  avgBacklinksPerNote: number;
  evergreenUpdateMedianDays?: number;
  overdueDecisions?: number;
  lintIssuesSampled?: number;
}

export interface VaultHealthEnhancedOutput {
  vault: {
    id: string;
    name: string;
  };
  stats: VaultHealthStats;
  recommendations: string[];
  // Optional detailed breakdowns for debugging
  details?: {
    typeCounts: TypeCounts;
    orphanPaths: string[];        // Paths of true orphans only
    staleEvergreenPaths: string[];
    overdueDecisionPaths: string[];
  };
}

/**
 * Calculate median of array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Handle vault-health-enhanced tool call
 */
export async function handleVaultHealthEnhanced(
  context: ServerContext,
  args: VaultHealthEnhancedInput
): Promise<ToolResponse<VaultHealthEnhancedOutput>> {
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
    const fileOps = new FileOperations(vault.path);

    // List all markdown files
    const files = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: false
    });

    const notePaths = files.filter(f => f.type === 'file' && f.path.endsWith('.md')).map(f => f.path);
    const totalNotes = notePaths.length;

    // Initialize metrics
    const typeCounts: TypeCounts = {
      atomic: 0,
      evergreen: 0,
      decision: 0,
      project: 0,
      framework: 0,
      journal: 0,
      untyped: 0
    };

    const backlinkMap = new Map<string, Set<string>>(); // path -> set of paths linking to it
    const evergreenUpdateDays: number[] = [];
    const evergreenPaths: string[] = [];
    const staleEvergreenPaths: string[] = [];

    const decisionCounts = {
      proposed: 0,
      accepted: 0,
      rejected: 0,
      superseded: 0
    };
    const overdueDecisionPaths: string[] = [];

    const now = new Date();

    // First pass: collect type counts, backlinks, and metrics
    for (const notePath of notePaths) {
      try {
        const content = await fileOps.readFile(notePath);
        const parsed = parseFrontmatter(content);

        // Count by type
        const type = parsed.frontmatter?.type;
        if (type && type in typeCounts) {
          typeCounts[type as keyof TypeCounts]++;
        } else {
          typeCounts.untyped++;
        }

        // Extract wikilinks for backlink calculation
        const links = extractWikilinks(content);
        for (const link of links) {
          if (!link.isEmbed) {
            // Normalize link target (remove .md extension if present)
            let target = link.target.replace(/\.md$/, '');

            // Try to resolve to actual file
            const matchingPath = notePaths.find(p => {
              const pathWithoutExt = p.replace(/\.md$/, '');
              return pathWithoutExt === target || pathWithoutExt.endsWith(`/${target}`);
            });

            if (matchingPath) {
              if (!backlinkMap.has(matchingPath)) {
                backlinkMap.set(matchingPath, new Set());
              }
              backlinkMap.get(matchingPath)!.add(notePath);
            }
          }
        }

        // Evergreen metrics
        if (type === 'evergreen') {
          evergreenPaths.push(notePath);
          if (parsed.frontmatter?.updated) {
            const updated = new Date(parsed.frontmatter.updated);
            const daysSinceUpdate = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
            evergreenUpdateDays.push(daysSinceUpdate);

            if (daysSinceUpdate > 90) {
              staleEvergreenPaths.push(notePath);
            }
          }
        }

        // Decision metrics
        if (type === 'decision') {
          const status = parsed.frontmatter?.status || 'proposed';
          if (status in decisionCounts) {
            decisionCounts[status as keyof typeof decisionCounts]++;
          }

          // Check for overdue reviews
          if (parsed.frontmatter?.review_date) {
            const reviewDate = new Date(parsed.frontmatter.review_date);
            if (reviewDate < now) {
              overdueDecisionPaths.push(notePath);
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Calculate true orphan metrics (exclude atomics per spec §5.6.4)
    const trueOrphanPaths: string[] = [];
    let trueOrphans = 0;

    for (const notePath of notePaths) {
      const backlinks = backlinkMap.get(notePath);
      if (!backlinks || backlinks.size === 0) {
        // Check if this is an atomic note
        try {
          const content = await fileOps.readFile(notePath);
          const parsed = parseFrontmatter(content);
          const type = parsed.frontmatter?.type;

          // Only count non-atomic notes as true orphans
          if (type !== 'atomic') {
            trueOrphans++;
            trueOrphanPaths.push(notePath);
          }
        } catch (error) {
          // If we can't read the note, conservatively count it as a true orphan
          trueOrphans++;
          trueOrphanPaths.push(notePath);
        }
      }
    }

    // Calculate backlink metrics
    const backlinkCounts = Array.from(backlinkMap.values()).map(set => set.size);
    const averageBacklinks = backlinkCounts.length > 0
      ? backlinkCounts.reduce((a, b) => a + b, 0) / backlinkCounts.length
      : 0;

    // Calculate orphan percentage (spec §5.6.4: percentage of non-atomic notes that are orphans)
    const nonAtomicNotes = totalNotes - typeCounts.atomic;
    const orphanPercentage = nonAtomicNotes > 0
      ? Math.round((trueOrphans / nonAtomicNotes) * 10000) / 100
      : 0;

    // Optional lint hygiene sampling
    let lintIssuesSampled: number | undefined;
    if (args.sampleLintHygiene) {
      const sampleSize = Math.min(args.lintSampleSize || 20, totalNotes);
      const samplePaths = notePaths
        .sort(() => Math.random() - 0.5)
        .slice(0, sampleSize);

      let notesWithIssues = 0;

      for (const notePath of samplePaths) {
        try {
          const content = await fileOps.readFile(notePath);
          const lintResult = await lintMarkdown(content, { applyFixes: false });

          if (lintResult.diagnostics.length > 0) {
            notesWithIssues++;
          }
        } catch (error) {
          // Skip
        }
      }

      lintIssuesSampled = notesWithIssues;
    }

    // Build VaultHealthStats
    const stats: VaultHealthStats = {
      totalNotes,
      atomicNotes: typeCounts.atomic,
      evergreenNotes: typeCounts.evergreen,
      decisionLogs: typeCounts.decision,
      trueOrphans,
      orphanPercentage,
      avgBacklinksPerNote: Math.round(averageBacklinks * 100) / 100,
      evergreenUpdateMedianDays: evergreenUpdateDays.length > 0 ? median(evergreenUpdateDays) : undefined,
      overdueDecisions: overdueDecisionPaths.length > 0 ? overdueDecisionPaths.length : undefined,
      lintIssuesSampled
    };

    // Generate recommendations
    const recommendations: string[] = [];

    if (orphanPercentage > 20) {
      recommendations.push(`High orphan rate (${orphanPercentage}%): ${trueOrphans} non-atomic notes lack backlinks. Consider connecting notes to improve knowledge graph coherence.`);
    }

    if (staleEvergreenPaths.length > 0) {
      recommendations.push(`${staleEvergreenPaths.length} evergreen notes haven't been updated in 90+ days. Review and refresh stale evergreen content.`);
    }

    if (overdueDecisionPaths.length > 0) {
      recommendations.push(`${overdueDecisionPaths.length} decisions have overdue review dates. Update decision statuses and review dates.`);
    }

    if (averageBacklinks < 2) {
      recommendations.push(`Low average backlinks (${stats.avgBacklinksPerNote}). Increase note connectivity through more wikilinks.`);
    }

    if (lintIssuesSampled && lintIssuesSampled > 0) {
      recommendations.push(`${lintIssuesSampled} notes in sample have lint issues. Consider running lint-folder to improve consistency.`);
    }

    return {
      status: 'ok',
      data: {
        vault: {
          id: args.vault,
          name: vault.name
        },
        stats,
        recommendations,
        details: {
          typeCounts,
          orphanPaths: trueOrphanPaths.slice(0, 20),
          staleEvergreenPaths: staleEvergreenPaths.slice(0, 10),
          overdueDecisionPaths: overdueDecisionPaths.slice(0, 10)
        }
      },
      meta: {
        tool: 'vault-health-enhanced',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'VAULT_HEALTH_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
