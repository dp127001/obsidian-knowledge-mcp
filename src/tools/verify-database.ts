/**
 * verify-database tool implementation
 * Verify database integrity and check for issues
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';

export interface VerifyDatabaseInput {
  checkIntegrity?: boolean; // Run SQLite integrity check (default: true)
  checkOrphans?: boolean; // Check for orphaned entries (default: true)
}

export interface IntegrityCheckResult {
  passed: boolean;
  errors?: string[];
}

export interface OrphanCheckResult {
  orphanedHistoryEntries: number;
  orphanedConcepts: number;
  orphanedDecisions: number;
}

export interface VerifyDatabaseOutput {
  databasePath: string;
  integrityCheck?: IntegrityCheckResult;
  orphanCheck?: OrphanCheckResult;
  tables: string[];
  totalHistoryEntries: number;
  success: boolean;
}

/**
 * Handle verify-database tool call
 */
export async function handleVerifyDatabase(
  context: ServerContext,
  args: VerifyDatabaseInput
): Promise<ToolResponse<VerifyDatabaseOutput>> {
  try {
    const checkIntegrity = args.checkIntegrity !== false;
    const checkOrphans = args.checkOrphans !== false;

    const db = context.db.getRawDb();

    // Get database path
    const dbPath = context.config.database?.path || './knowledge.db';

    // Get tables
    const tables = context.db.getTables();

    // Count total history entries
    const historyCount = db.prepare('SELECT COUNT(*) as count FROM note_history').get() as { count: number };
    const totalHistoryEntries = historyCount.count;

    // Integrity check
    let integrityCheck: IntegrityCheckResult | undefined;
    if (checkIntegrity) {
      try {
        const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const passed = result.length === 1 && result[0].integrity_check === 'ok';
        integrityCheck = {
          passed,
          errors: passed ? undefined : result.map(r => r.integrity_check)
        };
      } catch (error) {
        integrityCheck = {
          passed: false,
          errors: [error instanceof Error ? error.message : String(error)]
        };
      }
    }

    // Orphan check
    let orphanCheck: OrphanCheckResult | undefined;
    if (checkOrphans) {
      // Check for history entries referencing non-existent vaults
      const validVaultIds = new Set(context.config.vaults.map(v => v.id));
      const orphanedHistory = db
        .prepare('SELECT DISTINCT vault FROM note_history')
        .all() as { vault: string }[];

      const orphanedHistoryEntries = orphanedHistory.filter(
        row => !validVaultIds.has(row.vault)
      ).length;

      // Placeholder for concepts and decisions orphan check
      // These would check if concepts/decisions reference non-existent notes
      const orphanedConcepts = 0;
      const orphanedDecisions = 0;

      orphanCheck = {
        orphanedHistoryEntries,
        orphanedConcepts,
        orphanedDecisions
      };
    }

    const success =
      (!integrityCheck || integrityCheck.passed) &&
      (!orphanCheck || orphanCheck.orphanedHistoryEntries === 0);

    return {
      status: 'ok',
      data: {
        databasePath: dbPath,
        integrityCheck,
        orphanCheck,
        tables,
        totalHistoryEntries,
        success
      },
      meta: {
        tool: 'verify-database',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'VERIFY_DATABASE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
