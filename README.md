# Obsidian Knowledge MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with structured access to Obsidian knowledge bases, featuring advanced search, provenance tracking, and knowledge workflow automation.

## Features

### Core Capabilities
- **Multi-Vault Access**: Manage multiple Obsidian vaults with classification-based policies
- **Provenance Tracking**: Complete audit trail of all note operations with SHA-256 content verification
- **Advanced Search**: Three search algorithms (Regex+, uFuzzy, fuzzysort) for different use cases
- **Knowledge Workflows**: Conversation processing, evergreen note management, decision logging
- **Markdown Linting**: Obsidian-specific rules with auto-fixing capabilities
- **Health Metrics**: Comprehensive vault analytics and diagnostics

### Search & Discovery
- **search-vault**: Regex-based exact search with highlighting
- **fuzzy-search**: Typo-tolerant fuzzy search with configurable algorithms
- **find-broken-links**: Detect wikilinks pointing to non-existent notes
- **analyze-connections**: Graph analysis of note relationships
- **analyze-tags**: Tag usage statistics and hierarchy

### Knowledge Management
- **process-conversation**: Convert conversations into atomic notes and archives
- **evergreen-note**: Create/update evergreen notes with lifecycle tracking
- **decision-log**: Document decisions in ADR format
- **extract-concepts**: Extract and link concepts across notes

### Quality & Maintenance
- **lint-note**: Lint individual notes with Obsidian-specific rules
- **lint-folder**: Batch lint multiple notes
- **vault-health-enhanced**: Comprehensive health metrics (orphans, staleness, backlinks)
- **verify-database**: Database integrity checks
- **rebuild-index**: Force rebuild search index

## Installation

### Prerequisites
- Node.js >= 18.0.0
- An Obsidian vault (or multiple vaults)

### Install from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-knowledge-mcp.git
cd obsidian-knowledge-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Optional: Link globally for CLI usage
npm link
```

### Verify Installation

```bash
obsidian-knowledge-mcp --version
# Output: obsidian-knowledge-mcp v0.1.0

obsidian-knowledge-mcp --help
# Shows usage information
```

## Configuration

The server supports two configuration methods: environment variables or a JSON config file.

### Option 1: Environment Variables

```bash
export VAULT_PATHS="/Users/you/Documents/ObsidianVault"
export VAULT_NAMES="My Vault"
export VAULT_IDS="main"
export DATABASE_PATH="/Users/you/.obsidian-knowledge/knowledge.db"
export LOG_LEVEL="info"

obsidian-knowledge-mcp
```

**Multiple Vaults:**

```bash
export VAULT_PATHS="/path/to/vault1,/path/to/vault2"
export VAULT_NAMES="Personal,Work"
export VAULT_IDS="personal,work"
```

### Option 2: Config File

Create `mcp-config.json`:

```json
{
  "vaults": [
    {
      "id": "personal",
      "name": "Personal Knowledge Base",
      "path": "/Users/you/Documents/PersonalVault",
      "enabled": true,
      "classification": "personal"
    },
    {
      "id": "work",
      "name": "Work Notes",
      "path": "/Users/you/Documents/WorkVault",
      "enabled": true,
      "classification": "work"
    }
  ],
  "databasePath": "/Users/you/.obsidian-knowledge/knowledge.db",
  "logging": {
    "level": "info",
    "file": "/Users/you/.obsidian-knowledge/server.log"
  },
  "search": {
    "fuzzyThreshold": 0.5
  },
  "linter": {
    "autoLintDefault": false
  }
}
```

Then run:

```bash
CONFIG_PATH=./mcp-config.json obsidian-knowledge-mcp
```

## Integration with AI Assistants

### Claude Desktop

1. Locate your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "obsidian-knowledge": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-knowledge-mcp/build/index.js"
      ],
      "env": {
        "VAULT_PATHS": "/Users/you/Documents/ObsidianVault",
        "VAULT_NAMES": "My Vault",
        "VAULT_IDS": "main",
        "DATABASE_PATH": "/Users/you/.obsidian-knowledge/knowledge.db",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

3. Restart Claude Desktop

4. Verify the server appears in the MCP section

### ChatGPT (with MCP Support)

Create or update `chatgpt.mcp.json`:

```json
{
  "mcpServers": {
    "obsidian-knowledge": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-knowledge-mcp/build/index.js"
      ],
      "env": {
        "CONFIG_PATH": "/path/to/mcp-config.json"
      }
    }
  }
}
```

### Using MCP Inspector for Testing

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

Set environment variables in the inspector UI or use the config file approach.

## Available Tools (20 Total)

### Vault & File Operations (3)
1. **list-vaults**: List all configured vaults
2. **read-note**: Read a specific note
3. **create-note**: Create a new note with provenance

### Search & Discovery (5)
4. **search-vault**: Regex-based exact search
5. **fuzzy-search**: Fuzzy search with multiple algorithms
6. **list-files-in-vault**: List files/folders
7. **find-broken-links**: Find broken wikilinks
8. **analyze-connections**: Graph analysis

### Analysis (3)
9. **extract-concepts**: Extract concepts from notes
10. **analyze-tags**: Tag usage statistics
11. **vault-health-enhanced**: Comprehensive health metrics

### Knowledge Workflows (3)
12. **process-conversation**: Convert conversations to notes
13. **evergreen-note**: Manage evergreen notes
14. **decision-log**: Document decisions (ADR format)

### Linting (2)
15. **lint-note**: Lint individual note
16. **lint-folder**: Batch lint notes

### Administrative (4)
17. **get-server-status**: Server health and status
18. **index-status**: Check search index status
19. **rebuild-index**: Force rebuild search index
20. **verify-database**: Database integrity checks

## Development

### Build

```bash
npm run build       # Compile TypeScript
npm run watch       # Watch mode for development
npm run clean       # Remove build artifacts
```

### Testing

```bash
npm test            # Run tests
npm run test:coverage  # Run with coverage report
```

### Linting

```bash
npm run lint        # Run ESLint
```

## Architecture

### Project Structure

```
obsidian-knowledge-mcp/
├── src/
│   ├── index.ts              # CLI entrypoint
│   ├── server.ts             # MCP server implementation
│   ├── config/               # Configuration management
│   ├── database/             # SQLite provenance database
│   ├── tools/                # MCP tool implementations (20 tools)
│   ├── search/               # Multi-algorithm search engine
│   ├── vault/                # File operations & frontmatter
│   ├── linter/               # Markdown linting engine
│   └── types/                # TypeScript type definitions
├── build/                    # Compiled JavaScript (generated)
├── tests/                    # Test files
├── docs/                     # Additional documentation
├── claude.mcp.json           # Claude Desktop config template
├── chatgpt.mcp.json          # ChatGPT config template
├── mcp-config.example.json   # Server config example
├── MIGRATION.md              # Migration guide
├── CLAUDE.md                 # AI assistant development guide
├── package.json
└── tsconfig.json
```

### Technology Stack

- **TypeScript**: Type-safe server implementation
- **@modelcontextprotocol/sdk**: MCP protocol support
- **better-sqlite3**: Provenance database
- **@leeoniya/ufuzzy**: Content fuzzy search
- **fuzzysort**: Path fuzzy search
- **gray-matter**: Frontmatter parsing
- **remark**: Markdown processing and linting

### Provenance Database Schema

All write operations are tracked in SQLite:

```sql
CREATE TABLE note_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vault TEXT NOT NULL,
  note_path TEXT NOT NULL,
  operation TEXT NOT NULL,  -- 'create', 'update', 'delete'
  actor TEXT NOT NULL,       -- User/system identifier
  source TEXT NOT NULL,      -- 'mcp', 'api', 'sync', etc.
  timestamp TEXT NOT NULL,
  request_id TEXT NOT NULL,
  conversation_id TEXT,
  insight_id TEXT,
  decision_id TEXT,
  content_hash TEXT NOT NULL,
  content_before TEXT,
  content_after TEXT,
  metadata TEXT
);
```

## Migration

If migrating from an earlier implementation, see [MIGRATION.md](MIGRATION.md) for detailed migration instructions.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

See [CLAUDE.md](CLAUDE.md) for development guidelines.

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: https://github.com/yourusername/obsidian-knowledge-mcp/issues
- **Documentation**: https://github.com/yourusername/obsidian-knowledge-mcp
- **MCP Specification**: https://modelcontextprotocol.io

## Acknowledgments

- Built on the [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- Inspired by Obsidian's knowledge management philosophy
- Uses fuzzy search algorithms from [@leeoniya/ufuzzy](https://github.com/leeoniya/uFuzzy) and [fuzzysort](https://github.com/farzher/fuzzysort)

---

**Version**: 0.1.0
**Last Updated**: 2025-01-19
