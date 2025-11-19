#!/usr/bin/env node

/**
 * Main entry point for Obsidian Knowledge MCP Server
 */

import { loadConfig } from './config/index.js';
import { createDatabase } from './database/index.js';
import { runServer } from './server.js';

const VERSION = '0.1.0';

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Obsidian Knowledge MCP Server v${VERSION}

Usage: obsidian-knowledge-mcp [options]

A Model Context Protocol server providing structured access to Obsidian vaults
with search, provenance tracking, and knowledge workflow capabilities.

Options:
  -h, --help       Show this help message
  -v, --version    Show version number

Configuration:
  The server can be configured via environment variables or config file:

  Environment Variables:
    CONFIG_PATH      Path to JSON config file (default: ./mcp-config.json)
    VAULT_PATHS      Comma-separated vault paths (required if no config file)
    VAULT_NAMES      Comma-separated vault names (optional)
    VAULT_IDS        Comma-separated vault IDs (optional)
    DATABASE_PATH    Path to SQLite database (default: ./obsidian-knowledge-mcp.db)
    LOG_LEVEL        Logging level: debug, info, warn, error (default: info)

  Config File (mcp-config.json):
    {
      "vaults": [
        {
          "id": "main",
          "name": "Main Vault",
          "path": "/path/to/vault",
          "enabled": true,
          "classification": "personal"
        }
      ],
      "databasePath": "./knowledge.db",
      "logging": {
        "level": "info",
        "file": "./server.log"
      },
      "search": {
        "fuzzyThreshold": 0.5
      },
      "linter": {
        "autoLintDefault": false
      }
    }

Examples:
  # Run with environment variables
  VAULT_PATHS=/path/to/vault obsidian-knowledge-mcp

  # Run with config file
  CONFIG_PATH=./my-config.json obsidian-knowledge-mcp

For more information: https://github.com/yourusername/obsidian-knowledge-mcp
`);
}

/**
 * Main function
 */
async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`obsidian-knowledge-mcp v${VERSION}`);
    process.exit(0);
  }

  try {
    // Load configuration
    console.error('Loading configuration...');
    const config = await loadConfig();

    // Initialize database
    console.error('Initializing database...');
    const db = createDatabase(config.databasePath);

    console.error(`Database: ${config.databasePath}`);

    // Run server
    await runServer({
      config,
      db
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\nShutting down gracefully...');
  process.exit(0);
});

// Run
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
