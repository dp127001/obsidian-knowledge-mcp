# Migration Guide

This guide covers the changes introduced in the unified Obsidian Knowledge MCP Server specification and how to migrate from earlier implementations.

## Overview

The unified specification consolidates and enhances the MCP server with:
- Provenance tracking for all write operations
- Multi-algorithm search (Regex+, uFuzzy, fuzzysort)
- Knowledge workflows (conversation processing, evergreen notes, decision logs)
- Markdown linting with Obsidian-specific rules
- Health metrics and administrative tools
- Multi-vault policy enforcement

## Breaking Changes

### 1. Tool Renaming

#### `get-file-contents` → `read-note`

**Old API:**
```json
{
  "name": "get-file-contents",
  "arguments": {
    "vault": "main",
    "file": "MyNote.md"
  }
}
```

**New API:**
```json
{
  "name": "read-note",
  "arguments": {
    "vault": "main",
    "path": "MyNote.md",
    "includeRaw": true,
    "includeBody": true,
    "includeFrontmatter": true
  }
}
```

**Migration:**
- Rename `get-file-contents` to `read-note`
- Rename parameter `file` to `path`
- Add optional control flags for what content to include

### 2. Search Result Shape Changes

#### Unified Search Response Format

All search tools now return consistent result shapes with provenance metadata:

**Old Response:**
```json
{
  "results": [
    {
      "path": "Note.md",
      "title": "Note",
      "content": "..."
    }
  ]
}
```

**New Response:**
```json
{
  "status": "ok",
  "data": {
    "vault": "main",
    "query": "search term",
    "algorithm": "regex",
    "results": [
      {
        "path": "Note.md",
        "title": "Note",
        "score": 0.95,
        "matchedFields": ["title", "content"],
        "excerpt": "...highlighted excerpt..."
      }
    ],
    "totalResults": 1,
    "hasMore": false
  },
  "meta": {
    "tool": "search-vault",
    "vault": "main",
    "timestamp": "2025-01-19T12:00:00.000Z"
  }
}
```

**Migration:**
- Access results via `response.data.results` instead of `response.results`
- Use `score` field for result ranking
- Use `excerpt` field instead of full content for search result previews
- Check `status` field for error handling

#### Algorithm-Specific Search

**New: fuzzy-search Tool**

Dedicated fuzzy search with configurable algorithms:

```json
{
  "name": "fuzzy-search",
  "arguments": {
    "vault": "main",
    "query": "my note",
    "algorithm": "ufuzzy",
    "limit": 10,
    "searchPaths": true,
    "searchContent": true
  }
}
```

**Migration:**
- For fuzzy/typo-tolerant search, use `fuzzy-search` instead of `search-vault`
- Choose algorithm: `ufuzzy` for content, `fuzzysort` for paths
- Set `searchPaths` and `searchContent` flags based on needs

### 3. Linter Behavior

#### Auto-Linting in Write Operations

**New Parameter: `autoLint`**

All write tools (`create-note`, `process-conversation`, `evergreen-note`, `decision-log`) now support automatic linting:

```json
{
  "name": "create-note",
  "arguments": {
    "vault": "main",
    "path": "NewNote.md",
    "frontmatter": {...},
    "body": "...",
    "autoLint": true
  }
}
```

**Default:** `false` (can be configured globally via `linter.autoLintDefault` in config)

**Migration:**
- Add `autoLint: true` to enable automatic formatting
- Or set `linter.autoLintDefault: true` in config for global default

#### Dedicated Linting Tools

**New Tools:**
- `lint-note`: Lint a single note
- `lint-folder`: Batch lint multiple notes

```json
{
  "name": "lint-note",
  "arguments": {
    "vault": "main",
    "path": "MyNote.md",
    "applyFixes": true,
    "rules": {
      "requireFrontmatter": true,
      "headingIncrement": true,
      "trailingWhitespace": true
    }
  }
}
```

**Migration:**
- Use `lint-note` for on-demand linting
- Use `lint-folder` for batch cleanup
- Set `applyFixes: true` to auto-fix issues

### 4. Provenance Semantics

#### Provenance Tracking

All write operations now record provenance in the `note_history` table:

**Provenance Fields:**
```typescript
{
  vault: string;           // Vault ID
  note_path: string;       // Path to note
  operation: 'create' | 'update' | 'delete';
  actor: string;           // User/system identifier
  source: string;          // 'mcp', 'api', 'sync', etc.
  timestamp: string;       // ISO 8601 timestamp
  request_id: string;      // Unique request identifier
  conversation_id?: string;// Conversation tracking
  content_hash: string;    // SHA-256 of content
  content_before?: string; // Previous content (updates only)
  content_after?: string;  // New content
}
```

**Migration:**
- Provenance is automatic - no code changes needed
- Set `actor` and `source` parameters in write operations for better tracking
- Use `request_id` to correlate related operations
- Use `conversation_id` to track multi-turn workflows

#### Coherence IDs

New coherence tracking for knowledge workflows:

```typescript
{
  conversation_id?: string; // Track conversation threads
  insight_id?: string;      // Link to source insights
  decision_id?: string;     // Link to decision records
  concept_ids?: string[];   // Link to concept definitions
}
```

**Migration:**
- Use `process-conversation` to automatically generate these IDs
- Pass IDs between tools to maintain knowledge graph coherence

### 5. Vault Classification

#### Multi-Vault Policy

Vaults now support classification for policy enforcement:

```json
{
  "vaults": [
    {
      "id": "personal",
      "name": "Personal Notes",
      "path": "/path/to/vault",
      "enabled": true,
      "classification": "personal"
    },
    {
      "id": "work",
      "name": "Work Notes",
      "path": "/path/to/work",
      "enabled": true,
      "classification": "work"
    }
  ]
}
```

**Classifications:**
- `personal`: Personal knowledge base
- `work`: Work-related notes
- `archive`: Archived/read-only content
- `shared`: Shared/collaborative vault

**Migration:**
- Add `classification` field to vault configs
- Future versions will enforce cross-vault policies

### 6. Health Metrics

#### New Administrative Tools

**vault-health-enhanced:**
Comprehensive vault health metrics:

```json
{
  "name": "vault-health-enhanced",
  "arguments": {
    "vault": "main",
    "sampleLintHygiene": true,
    "lintSampleSize": 20
  }
}
```

Returns:
- Type counts (atomic, evergreen, decision, etc.)
- Orphan detection (separate tracking for atomics vs evergreen/decision)
- Backlink metrics
- Evergreen staleness (notes not updated in 90+ days)
- Decision overdue tracking
- Optional lint hygiene sampling

**get-server-status:**
Server health and monitoring:

```json
{
  "name": "get-server-status",
  "arguments": {
    "includeSystemInfo": true
  }
}
```

Returns:
- Server version
- Vault status (accessible, note counts)
- Database status (size, tables)
- System info (platform, memory, uptime)

**index-status:**
Check search index status

**rebuild-index:**
Force rebuild search index

**verify-database:**
Database integrity checks

**Migration:**
- Use these tools for monitoring and maintenance
- Schedule periodic health checks
- Use `verify-database` before/after major operations

## Configuration Changes

### Environment Variables

**New Variables:**
- `CONFIG_PATH`: Path to JSON config file
- `VAULT_PATHS`: Comma-separated vault paths
- `VAULT_NAMES`: Comma-separated vault names
- `VAULT_IDS`: Comma-separated vault IDs
- `DATABASE_PATH`: SQLite database path
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Config File Format

**New `mcp-config.json` Structure:**

```json
{
  "vaults": [...],
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
```

**Migration:**
- Move from CLI args to environment variables or config file
- Add logging and search configurations

## New Features

### 1. Knowledge Workflows

**process-conversation:**
Convert conversations into atomic notes and archive

```json
{
  "name": "process-conversation",
  "arguments": {
    "vault": "main",
    "conversationText": "...",
    "conversationDate": "2025-01-19",
    "archivePath": "Archive/2025-01-19.md",
    "conversationId": "conv-123"
  }
}
```

**evergreen-note:**
Create or update evergreen notes with lifecycle tracking

```json
{
  "name": "evergreen-note",
  "arguments": {
    "vault": "main",
    "path": "Evergreen/My Topic.md",
    "title": "My Topic",
    "body": "...",
    "stage": "budding",
    "conceptIds": ["concept-1", "concept-2"]
  }
}
```

**decision-log:**
Document decisions with ADR-style records

```json
{
  "name": "decision-log",
  "arguments": {
    "vault": "main",
    "title": "Use TypeScript for Backend",
    "context": "...",
    "decision": "...",
    "consequences": "...",
    "status": "accepted",
    "folder": "Decisions"
  }
}
```

### 2. Advanced Analysis

**analyze-connections:**
Graph analysis of note relationships

**extract-concepts:**
Extract and link concepts from notes

**analyze-tags:**
Tag usage statistics and hierarchy

## Migration Checklist

- [ ] Rename `get-file-contents` calls to `read-note` with `path` parameter
- [ ] Update search result handling to use `response.data.results`
- [ ] Add error handling for `status` field in responses
- [ ] Update fuzzy search calls to use `fuzzy-search` tool
- [ ] Add `autoLint` parameter to write operations if desired
- [ ] Configure vault `classification` in config file
- [ ] Add environment variables or config file for server setup
- [ ] Update provenance tracking to use `actor` and `source` parameters
- [ ] Test health metrics tools for monitoring
- [ ] Review and update any hardcoded tool schemas
- [ ] Update documentation and examples

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/obsidian-knowledge-mcp/issues
- Documentation: https://github.com/yourusername/obsidian-knowledge-mcp/blob/main/README.md

## Version History

- **0.1.0** (2025-01-19): Initial unified specification release
  - Consolidated Epics 0-6
  - Provenance tracking
  - Multi-algorithm search
  - Knowledge workflows
  - Linter integration
  - Health metrics
