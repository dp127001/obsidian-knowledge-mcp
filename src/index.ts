#!/usr/bin/env node

/**
 * Main entry point for Obsidian Knowledge MCP Server
 */

import { loadConfig } from './config/index.js';
import { createDatabase } from './database/index.js';
import { runServer } from './server.js';

/**
 * Main function
 */
async function main() {
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
