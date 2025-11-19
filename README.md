# Obsidian Knowledge MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with access to Obsidian knowledge bases. This server enables reading, searching, and managing markdown notes with provenance tracking, knowledge workflows, and advanced search capabilities.

## Features

- **Multi-vault support**: Access multiple Obsidian vaults simultaneously
- **Provenance tracking**: SQLite-backed history of all note operations
- **Knowledge workflows**: Process conversations into atomic notes, evergreen synthesis, and decision logs
- **Advanced search**: Hybrid search using exact matching and fuzzy algorithms
- **Frontmatter parsing**: Full support for YAML frontmatter and Obsidian conventions
- **Type safety**: Complete TypeScript implementation with strict typing

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

```bash
# Comma-separated vault paths
export VAULT_PATHS="/path/to/vault1,/path/to/vault2"

# Optional: Comma-separated vault names
export VAULT_NAMES="Personal,Work"

# Optional: Comma-separated vault IDs
export VAULT_IDS="personal,work"

# Optional: Database path (defaults to ./obsidian-knowledge-mcp.db)
export DATABASE_PATH="/path/to/database.db"

# Optional: Log level
export LOG_LEVEL="info"
```

### Configuration File

Alternatively, create `mcp-config.json`:

```json
{
  "vaults": [
    {
      "id": "personal",
      "name": "Personal Knowledge Base",
      "path": "/path/to/personal-vault",
      "enabled": true,
      "classification": "personal"
    },
    {
      "id": "work",
      "name": "Work Vault",
      "path": "/path/to/work-vault",
      "enabled": true,
      "classification": "work"
    }
  ],
  "databasePath": "./knowledge.db",
  "logging": {
    "level": "info"
  }
}
```

## Usage

### Standalone

```bash
# Run the server
npm run build
node build/index.js
```

### With Claude Desktop

Add to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "obsidian-knowledge": {
      "command": "node",
      "args": ["/path/to/obsidian-knowledge-mcp/build/index.js"],
      "env": {
        "VAULT_PATHS": "/path/to/your/vault",
        "VAULT_NAMES": "My Vault"
      }
    }
  }
}
```

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Available Tools

### Core Tools

- **`list-vaults`**: List all configured vaults with metadata
- **`read-note`**: Read a specific note with frontmatter parsing
- **`create-note`**: Create a new note with provenance tracking

### Planned Tools (see CLAUDE.md for full spec)

- **Search & Discovery**: `search-vault`, `fuzzy-search`, `find-similar-notes`, `find-broken-links`
- **Knowledge Workflows**: `process-conversation`, `evergreen-note`, `decision-log`
- **Health & Admin**: `vault-health-enhanced`, `get-server-status`
- **And 30+ more tools** (see full specification in CLAUDE.md)

## Development

### Project Structure

```
obsidian-knowledge-mcp/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── config/         # Configuration management
│   ├── database/       # SQLite database layer
│   ├── vault/          # Vault and file operations
│   ├── tools/          # MCP tool implementations
│   ├── server.ts       # MCP server setup
│   └── index.ts        # Main entry point
├── build/              # Compiled JavaScript
├── tests/              # Test files
└── CLAUDE.md           # Comprehensive specification
```

### Building

```bash
npm run build        # Compile TypeScript
npm run watch        # Watch mode for development
npm run clean        # Clean build artifacts
```

### Testing

```bash
npm test             # Run tests
npm run test:coverage # Run tests with coverage
```

### Linting

```bash
npm run lint         # Lint TypeScript code
```

## Architecture

The server implements a layered architecture:

1. **MCP Layer**: Protocol handling and tool registration
2. **Tool Layer**: Business logic for each MCP tool
3. **Vault Layer**: File operations and frontmatter parsing
4. **Database Layer**: SQLite operations and migrations
5. **Config Layer**: Configuration loading and validation

## Provenance Tracking

All write operations are tracked in the `note_history` table:

- Content hashes (SHA-256)
- Actor identification (user/llm/system)
- Source context
- Request IDs for idempotency
- Optional diffs

## Frontmatter Schema

The server supports a canonical frontmatter schema for knowledge management:

```yaml
type: atomic | evergreen | decision | project | framework | journal
para: project | area | resource | archive
stage: capture | process | connect | synthesize | crystallize
created: 2025-11-18
updated: 2025-11-19
tags:
  - Domain/Topic
  - Category/Subcategory
status: draft | evergreen | needs-review | closed
confidence: low | medium | high
```

## License

MIT

## Contributing

See CLAUDE.md for the full specification and implementation plan.
