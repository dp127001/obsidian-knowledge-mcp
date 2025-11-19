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

export interface OrphanMetrics {
  totalOrphans: number;
  orphanPaths: string[];
  // Atomics are often intentionally unlinked, so we track separately
  orphanAtomics: number;
  orphanEvergreenOrDecision: number;
}

export interface BacklinkMetrics {
  averageBacklinks: number;
  maxBacklinks: number;
  maxBacklinksPath: string;
  notesWithNoBacklinks: number;
}

export interface EvergreenMetrics {
  totalEvergreen: number;
  medianUpdateDays: number; // Days since last update
  staleEvergreen: number; // Not updated in 90+ days
  staleEvergreenPaths: string[];
}

export interface DecisionMetrics {
  totalDecisions: number;
  overdueReviews: number; // Decisions past review_date
  overdueDecisionPaths: string[];
  byStatus: {
    proposed: number;
    accepted: number;
    rejected: number;
    superseded: number;
  };
}

export interface LintHygieneMetrics {
  sampleSize: number;
  notesWithIssues: number;
  totalIssues: number;
  averageIssuesPerNote: number;
  issuesBySeverity: {
    error: number;
    warning: number;
    info: number;
  };
}

export interface VaultHealthEnhancedOutput {
  vault: string;
  totalNotes: number;
  typeCounts: TypeCounts;
  orphans: OrphanMetrics;
  backlinks: BacklinkMetrics;
  evergreen: EvergreenMetrics;
  decisions: DecisionMetrics;
  lintHygiene?: LintHygieneMetrics;
  timestamp: string;
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

    // Calculate orphan metrics
    const orphanPaths: string[] = [];
    let orphanAtomics = 0;
    let orphanEvergreenOrDecision = 0;

    for (const notePath of notePaths) {
      const backlinks = backlinkMap.get(notePath);
      if (!backlinks || backlinks.size === 0) {
        orphanPaths.push(notePath);

        // Categorize orphans
        try {
          const content = await fileOps.readFile(notePath);
          const parsed = parseFrontmatter(content);
          const type = parsed.frontmatter?.type;

          if (type === 'atomic') {
            orphanAtomics++;
          } else if (type === 'evergreen' || type === 'decision') {
            orphanEvergreenOrDecision++;
          }
        } catch (error) {
          // Skip
        }
      }
    }

    // Calculate backlink metrics
    const backlinkCounts = Array.from(backlinkMap.values()).map(set => set.size);
    const averageBacklinks = backlinkCounts.length > 0
      ? backlinkCounts.reduce((a, b) => a + b, 0) / backlinkCounts.length
      : 0;

    let maxBacklinks = 0;
    let maxBacklinksPath = '';
    backlinkMap.forEach((backlinks, path) => {
      if (backlinks.size > maxBacklinks) {
        maxBacklinks = backlinks.size;
        maxBacklinksPath = path;
      }
    });

    const notesWithNoBacklinks = totalNotes - backlinkMap.size;

    // Evergreen metrics
    const evergreenMetrics: EvergreenMetrics = {
      totalEvergreen: typeCounts.evergreen,
      medianUpdateDays: median(evergreenUpdateDays),
      staleEvergreen: staleEvergreenPaths.length,
      staleEvergreenPaths: staleEvergreenPaths.slice(0, 10) // Limit to top 10
    };

    // Decision metrics
    const decisionMetrics: DecisionMetrics = {
      totalDecisions: typeCounts.decision,
      overdueReviews: overdueDecisionPaths.length,
      overdueDecisionPaths: overdueDecisionPaths.slice(0, 10), // Limit to top 10
      byStatus: decisionCounts
    };

    // Optional lint hygiene sampling
    let lintHygiene: LintHygieneMetrics | undefined;
    if (args.sampleLintHygiene) {
      const sampleSize = Math.min(args.lintSampleSize || 20, totalNotes);
      const samplePaths = notePaths
        .sort(() => Math.random() - 0.5)
        .slice(0, sampleSize);

      let notesWithIssues = 0;
      let totalIssues = 0;
      const issuesBySeverity = { error: 0, warning: 0, info: 0 };

      for (const notePath of samplePaths) {
        try {
          const content = await fileOps.readFile(notePath);
          const lintResult = await lintMarkdown(content, { applyFixes: false });

          const issues = lintResult.diagnostics.length;
          if (issues > 0) {
            notesWithIssues++;
            totalIssues += issues;

            lintResult.diagnostics.forEach(d => {
              issuesBySeverity[d.severity]++;
            });
          }
        } catch (error) {
          // Skip
        }
      }

      lintHygiene = {
        sampleSize,
        notesWithIssues,
        totalIssues,
        averageIssuesPerNote: sampleSize > 0 ? totalIssues / sampleSize : 0,
        issuesBySeverity
      };
    }

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        totalNotes,
        typeCounts,
        orphans: {
          totalOrphans: orphanPaths.length,
          orphanPaths: orphanPaths.slice(0, 20), // Limit to top 20
          orphanAtomics,
          orphanEvergreenOrDecision
        },
        backlinks: {
          averageBacklinks: Math.round(averageBacklinks * 100) / 100,
          maxBacklinks,
          maxBacklinksPath,
          notesWithNoBacklinks
        },
        evergreen: evergreenMetrics,
        decisions: decisionMetrics,
        lintHygiene,
        timestamp: new Date().toISOString()
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
