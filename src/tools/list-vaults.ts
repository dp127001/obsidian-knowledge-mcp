/**
 * list-vaults tool implementation
 */

import { ServerContext } from '../server.js';
import { ToolResponse } from '../types/core.js';

export interface ListVaultsOutput {
  vaults: Array<{
    id: string;
    name: string;
    path: string;
    enabled: boolean;
    indexedFileCount: number;
    lastIndexedAt?: string;
    needsRebuild: boolean;
    classification?: 'personal' | 'work';
  }>;
  totalVaults: number;
}

/**
 * Handle list-vaults tool call
 */
export async function handleListVaults(
  context: ServerContext,
  _args: Record<string, unknown>
): Promise<ToolResponse<ListVaultsOutput>> {
  try {
    const vaults = context.config.vaults.map(vault => ({
      id: vault.id,
      name: vault.name,
      path: vault.path,
      enabled: vault.enabled,
      indexedFileCount: context.db.getIndexedFileCount(vault.id),
      lastIndexedAt: context.db.getLastIndexedAt(vault.id),
      needsRebuild: false, // TODO: Implement rebuild detection
      classification: vault.classification
    }));

    return {
      status: 'ok',
      data: {
        vaults,
        totalVaults: vaults.length
      },
      meta: {
        tool: 'list-vaults',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'LIST_VAULTS_ERROR',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
