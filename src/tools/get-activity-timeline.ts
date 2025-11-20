/**
 * get-activity-timeline tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteRef, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';

export interface TimelineEvent {
  timestamp: string;
  date: string; // YYYY-MM-DD
  operation: 'create' | 'update' | 'patch' | 'append' | 'delete' | 'batch';
  tool: string;
  actor: 'user' | 'llm' | 'system';
  note: NoteRef;
  source?: string;
}

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  eventCount: number;
  events: TimelineEvent[];
}

export interface GetActivityTimelineInput {
  vault: string;
  startDate?: string;  // ISO date
  endDate?: string;    // ISO date
  limit?: number;
  groupBy?: 'day' | 'event'; // default: day
}

export interface GetActivityTimelineOutput {
  vault: string;
  startDate?: string;
  endDate?: string;
  totalEvents: number;
  days?: TimelineDay[];
  events?: TimelineEvent[];
}

/**
 * Extract date (YYYY-MM-DD) from ISO timestamp
 */
function extractDate(timestamp: string): string {
  return timestamp.substring(0, 10);
}

/**
 * Handle get-activity-timeline tool call
 */
export async function handleGetActivityTimeline(
  context: ServerContext,
  args: GetActivityTimelineInput
): Promise<ToolResponse<GetActivityTimelineOutput>> {
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

    // Validate vault
    validateVault(context.config, args.vault);

    // Build query
    const db = context.db.getRawDb();
    let sql = 'SELECT timestamp, operation, tool, actor, vault, path, source FROM note_history WHERE vault = ?';
    const params: any[] = [args.vault];

    // Add date filters
    if (args.startDate) {
      sql += ' AND timestamp >= ?';
      params.push(args.startDate);
    }

    if (args.endDate) {
      sql += ' AND timestamp <= ?';
      params.push(args.endDate);
    }

    // Order by timestamp descending (most recent first)
    sql += ' ORDER BY timestamp DESC';

    // Add limit if specified
    const limit = args.limit || 1000;
    sql += ' LIMIT ?';
    params.push(limit);

    // Execute query
    const rows = db.prepare(sql).all(...params) as Array<{
      timestamp: string;
      operation: 'create' | 'update' | 'patch' | 'append' | 'delete' | 'batch';
      tool: string;
      actor: 'user' | 'llm' | 'system';
      vault: string;
      path: string;
      source: string | null;
    }>;

    // Convert to timeline events
    const allEvents: TimelineEvent[] = rows.map(row => ({
      timestamp: row.timestamp,
      date: extractDate(row.timestamp),
      operation: row.operation,
      tool: row.tool,
      actor: row.actor,
      note: {
        vault: row.vault,
        path: row.path
      },
      source: row.source || undefined
    }));

    const groupBy = args.groupBy || 'day';

    if (groupBy === 'event') {
      // Return events ungrouped
      return {
        status: 'ok',
        data: {
          vault: args.vault,
          startDate: args.startDate,
          endDate: args.endDate,
          totalEvents: allEvents.length,
          events: allEvents
        },
        meta: {
          tool: 'get-activity-timeline',
          vault: args.vault,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Group by day
    const dayMap = new Map<string, TimelineEvent[]>();

    for (const event of allEvents) {
      const date = event.date;
      if (!dayMap.has(date)) {
        dayMap.set(date, []);
      }
      dayMap.get(date)!.push(event);
    }

    // Convert to TimelineDay array (sorted by date descending)
    const days: TimelineDay[] = Array.from(dayMap.entries())
      .map(([date, events]) => ({
        date,
        eventCount: events.length,
        events
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      status: 'ok',
      data: {
        vault: args.vault,
        startDate: args.startDate,
        endDate: args.endDate,
        totalEvents: allEvents.length,
        days
      },
      meta: {
        tool: 'get-activity-timeline',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'GET_ACTIVITY_TIMELINE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
