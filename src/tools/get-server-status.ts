/**
 * get-server-status tool implementation
 * Server snapshot and status information
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';
import * as os from 'os';
import * as fs from 'fs/promises';

export interface GetServerStatusInput {
  includeSystemInfo?: boolean; // Include OS/system details (default: true)
}

export interface VaultStatus {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  classification?: 'work' | 'personal' | 'archive' | 'shared';
  accessible: boolean;
  noteCount?: number;
}

export interface DatabaseStatus {
  path: string;
  accessible: boolean;
  size?: number; // bytes
  tables?: string[];
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  totalMemory: number; // bytes
  freeMemory: number; // bytes
  uptime: number; // seconds
}

export interface GetServerStatusOutput {
  serverVersion: string;
  vaults: VaultStatus[];
  database: DatabaseStatus;
  systemInfo?: SystemInfo;
  startupTime: string;
  currentTime: string;
}

/**
 * Get note count for a vault
 */
async function getVaultNoteCount(vaultPath: string): Promise<number> {
  try {
    const stats = await fs.stat(vaultPath);
    if (!stats.isDirectory()) return 0;

    // Simple recursive count of .md files
    async function countMdFiles(dir: string): Promise<number> {
      let count = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          count += await countMdFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          count++;
        }
      }

      return count;
    }

    return await countMdFiles(vaultPath);
  } catch (error) {
    return 0;
  }
}

/**
 * Get database file size
 */
async function getDatabaseSize(dbPath: string): Promise<number> {
  try {
    const stats = await fs.stat(dbPath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

/**
 * Handle get-server-status tool call
 */
export async function handleGetServerStatus(
  context: ServerContext,
  args: GetServerStatusInput
): Promise<ToolResponse<GetServerStatusOutput>> {
  try {
    const includeSystemInfo = args.includeSystemInfo !== false;

    // Get vault statuses
    const vaults: VaultStatus[] = [];
    for (const vault of context.config.vaults) {
      let accessible = false;
      let noteCount: number | undefined;

      try {
        const stats = await fs.stat(vault.path);
        accessible = stats.isDirectory();

        if (accessible) {
          noteCount = await getVaultNoteCount(vault.path);
        }
      } catch (error) {
        accessible = false;
      }

      vaults.push({
        id: vault.id,
        name: vault.name,
        path: vault.path,
        enabled: vault.enabled !== false,
        classification: vault.classification,
        accessible,
        noteCount
      });
    }

    // Get database status
    const dbPath = context.config.database?.path || './knowledge.db';
    let dbAccessible = false;
    let dbSize: number | undefined;
    let dbTables: string[] | undefined;

    try {
      await fs.access(dbPath);
      dbAccessible = true;
      dbSize = await getDatabaseSize(dbPath);

      // Get table names from database
      try {
        const tables = context.db.getTables();
        dbTables = tables;
      } catch (error) {
        // Skip if can't get tables
      }
    } catch (error) {
      dbAccessible = false;
    }

    const database: DatabaseStatus = {
      path: dbPath,
      accessible: dbAccessible,
      size: dbSize,
      tables: dbTables
    };

    // Get system info
    let systemInfo: SystemInfo | undefined;
    if (includeSystemInfo) {
      systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
      };
    }

    // Use config version or default
    const serverVersion = context.config.version || '0.1.0';

    return {
      status: 'ok',
      data: {
        serverVersion,
        vaults,
        database,
        systemInfo,
        startupTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        currentTime: new Date().toISOString()
      },
      meta: {
        tool: 'get-server-status',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'SERVER_STATUS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
