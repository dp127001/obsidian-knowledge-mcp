/**
 * Configuration management for the MCP server
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { VaultConfig } from '../types/core.js';

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Array of vault configurations */
  vaults: VaultConfig[];
  /** Database file path (absolute or relative to config) */
  databasePath: string;
  /** Server version */
  version: string;
  /** Server start timestamp */
  startedAt: string;
  /** Logging configuration */
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
  /** Search engine configuration */
  search?: {
    fuzzyThreshold?: number; // 0-1, default 0.5
  };
  /** Linter configuration */
  linter?: {
    autoLintDefault?: boolean; // default false
  };
}

/**
 * Environment-based configuration
 */
export interface EnvConfig {
  /** Configuration file path */
  CONFIG_PATH?: string;
  /** Vault paths from environment */
  VAULT_PATHS?: string; // Comma-separated vault paths
  /** Vault names from environment */
  VAULT_NAMES?: string; // Comma-separated vault names
  /** Vault IDs from environment */
  VAULT_IDS?: string; // Comma-separated vault IDs
  /** Database path */
  DATABASE_PATH?: string;
  /** Log level */
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default database path
 */
const DEFAULT_DB_PATH = './obsidian-knowledge-mcp.db';

/**
 * Load configuration from environment and file
 */
export async function loadConfig(): Promise<ServerConfig> {
  const env = process.env as EnvConfig;

  // Try to load from config file if it exists
  const configPath = env.CONFIG_PATH || './mcp-config.json';
  let fileConfig: Partial<ServerConfig> = {};

  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    fileConfig = JSON.parse(configData);
  } catch (error) {
    // Config file doesn't exist or is invalid, use env/defaults
  }

  // Build vaults from environment
  const vaults: VaultConfig[] = [];

  if (env.VAULT_PATHS) {
    const paths = env.VAULT_PATHS.split(',').map(p => p.trim());
    const names = env.VAULT_NAMES?.split(',').map(n => n.trim()) || [];
    const ids = env.VAULT_IDS?.split(',').map(i => i.trim()) || [];

    paths.forEach((vaultPath, index) => {
      const absolutePath = path.resolve(vaultPath);
      const name = names[index] || path.basename(absolutePath);
      const id = ids[index] || name.toLowerCase().replace(/\s+/g, '-');

      vaults.push({
        id,
        name,
        path: absolutePath,
        enabled: true
      });
    });
  }

  // Merge file config vaults
  if (fileConfig.vaults) {
    for (const vault of fileConfig.vaults) {
      if (!vaults.some(v => v.id === vault.id)) {
        vaults.push({
          ...vault,
          path: path.resolve(vault.path)
        });
      }
    }
  }

  // If no vaults configured, throw error
  if (vaults.length === 0) {
    throw new Error(
      'No vaults configured. Set VAULT_PATHS environment variable or create mcp-config.json'
    );
  }

  // Validate vault paths exist
  for (const vault of vaults) {
    try {
      const stats = await fs.stat(vault.path);
      if (!stats.isDirectory()) {
        throw new Error(`Vault path is not a directory: ${vault.path}`);
      }
    } catch (error) {
      throw new Error(`Vault path does not exist: ${vault.path}`);
    }
  }

  const databasePath = path.resolve(
    env.DATABASE_PATH || fileConfig.databasePath || DEFAULT_DB_PATH
  );

  return {
    vaults,
    databasePath,
    version: '0.1.0',
    startedAt: new Date().toISOString(),
    logging: {
      level: env.LOG_LEVEL || fileConfig.logging?.level || 'info',
      file: fileConfig.logging?.file
    },
    search: {
      fuzzyThreshold: fileConfig.search?.fuzzyThreshold || 0.5
    },
    linter: {
      autoLintDefault: fileConfig.linter?.autoLintDefault || false
    }
  };
}

/**
 * Get vault by ID
 */
export function getVault(config: ServerConfig, vaultId: string): VaultConfig | undefined {
  return config.vaults.find(v => v.id === vaultId && v.enabled);
}

/**
 * Validate vault exists and is enabled
 */
export function validateVault(config: ServerConfig, vaultId: string): VaultConfig {
  const vault = getVault(config, vaultId);
  if (!vault) {
    throw new Error(`Vault not found or disabled: ${vaultId}`);
  }
  return vault;
}
