# CLAUDE.md - Obsidian Knowledge MCP Server

## Project Overview

This repository contains an MCP (Model Context Protocol) server that provides AI assistants with access to Obsidian knowledge bases. The server enables reading, searching, and querying markdown notes from Obsidian vaults.

### Purpose
- Provide structured access to Obsidian notes for AI assistants
- Enable semantic search and knowledge retrieval from markdown files
- Support Obsidian-specific features (wikilinks, tags, frontmatter)
- Integrate with Claude and other AI assistants via MCP protocol

## Repository Structure

### Expected Directory Layout
```
obsidian-knowledge-mcp/
├── src/                    # Source code
│   ├── index.ts           # Main server entry point
│   ├── server.ts          # MCP server implementation
│   ├── tools/             # MCP tool implementations
│   ├── resources/         # MCP resource handlers
│   └── utils/             # Utility functions
├── tests/                 # Test files
├── docs/                  # Documentation
├── package.json           # Node.js dependencies
├── tsconfig.json          # TypeScript configuration
├── README.md              # User-facing documentation
└── CLAUDE.md              # This file (AI assistant guide)
```

## Technology Stack

### Core Technologies
- **TypeScript**: Primary programming language
- **Node.js**: Runtime environment
- **@modelcontextprotocol/sdk**: MCP SDK for server implementation
- **stdio transport**: Standard I/O for MCP communication

### Expected Dependencies
- File system operations for reading Obsidian vaults
- Markdown parsing (e.g., `remark`, `gray-matter`)
- Wikilink resolution
- Search/indexing capabilities

## Development Workflow

### Setup
```bash
npm install
npm run build
npm test
```

### Testing
- Use the MCP Inspector for manual testing
- Write unit tests for individual tools
- Test with actual Obsidian vaults

### Building
```bash
npm run build          # Build TypeScript to JavaScript
npm run watch          # Watch mode for development
```

## MCP Server Implementation

### Tools to Implement

#### 1. `search_notes`
Search for notes by content or title.
```typescript
{
  name: "search_notes",
  description: "Search for notes in the Obsidian vault",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      tags: { type: "array", items: { type: "string" } },
      limit: { type: "number", default: 10 }
    }
  }
}
```

#### 2. `read_note`
Read the full content of a specific note.
```typescript
{
  name: "read_note",
  description: "Read a specific note by path or title",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Note path or title" }
    }
  }
}
```

#### 3. `list_tags`
List all tags used in the vault.

#### 4. `get_backlinks`
Get backlinks for a specific note.

#### 5. `query_by_frontmatter`
Query notes by frontmatter properties.

### Resources to Implement

#### `obsidian://vault/`
Provide access to the vault structure and metadata.

## Code Conventions

### TypeScript Style
- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use explicit return types for functions
- Enable `strictNullChecks` and `noImplicitAny`

### Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (prefix with `I` if ambiguous)

### Error Handling
- Use custom error classes for different error types
- Throw `McpError` from MCP SDK for tool errors
- Log errors with context for debugging
- Validate inputs before processing

### File Organization
```typescript
// 1. Imports (grouped: stdlib, external, internal)
import * as fs from 'fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { searchNotes } from './utils/search.js';

// 2. Types and interfaces
interface SearchOptions { ... }

// 3. Constants
const DEFAULT_LIMIT = 10;

// 4. Functions
function searchNotes() { ... }

// 5. Main/exports
export { searchNotes };
```

## Obsidian-Specific Considerations

### Wikilinks
- Format: `[[Note Title]]` or `[[Note Title|Display Text]]`
- Support section links: `[[Note#Section]]`
- Support block references: `[[Note#^block-id]]`

### Tags
- Format: `#tag` or `#nested/tag`
- Can appear in frontmatter or content
- Case-sensitive by default (follow Obsidian behavior)

### Frontmatter
```yaml
---
title: Note Title
tags: [tag1, tag2]
date: 2025-01-01
---
```
- Parse YAML frontmatter
- Support various property types (strings, arrays, dates)

### Markdown Extensions
- Support Obsidian callouts: `> [!note]`
- Handle embedded files: `![[image.png]]`
- Support Dataview queries (read-only)

## Configuration

### Vault Path
- Accept vault path as server argument or environment variable
- Validate vault exists and is readable
- Support multiple vaults (if needed)

### Search Indexing
- Consider building an index on startup for faster searches
- Watch for file changes and update index
- Balance memory usage vs. search speed

## Security Considerations

### File Access
- Only allow access within configured vault directory
- Prevent path traversal attacks (`../`)
- Validate all file paths before reading

### Input Validation
- Sanitize search queries to prevent injection
- Validate file paths and names
- Limit search results to prevent DOS

### Data Privacy
- Notes may contain sensitive personal information
- Document that all data is processed locally
- No external API calls without explicit configuration

## Testing Strategy

### Unit Tests
```typescript
describe('searchNotes', () => {
  it('should find notes by title', async () => {
    // Test implementation
  });

  it('should handle wikilinks correctly', async () => {
    // Test implementation
  });
});
```

### Integration Tests
- Test with sample Obsidian vault
- Verify MCP protocol compliance
- Test all tools end-to-end

### Test Fixtures
```
tests/fixtures/
├── sample-vault/
│   ├── Note 1.md
│   ├── Note 2.md
│   └── subfolder/
│       └── Note 3.md
```

## Common Patterns

### Reading Files
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

async function readNote(vaultPath: string, notePath: string): Promise<string> {
  const fullPath = path.join(vaultPath, notePath);
  // Validate path is within vault
  if (!fullPath.startsWith(vaultPath)) {
    throw new Error('Invalid path: outside vault');
  }
  return await fs.readFile(fullPath, 'utf-8');
}
```

### Parsing Wikilinks
```typescript
function extractWikilinks(content: string): string[] {
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.push(match[1].split('|')[0]); // Handle display text
  }
  return links;
}
```

### MCP Tool Handler
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'search_notes':
      return await handleSearchNotes(args);
    case 'read_note':
      return await handleReadNote(args);
    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
  }
});
```

## Debugging

### MCP Inspector
```bash
npx @modelcontextprotocol/inspector node build/index.js /path/to/vault
```

### Logging
- Use structured logging (e.g., `winston` or `pino`)
- Log at appropriate levels (debug, info, warn, error)
- Include context in log messages

### Common Issues
1. **Path resolution**: Ensure paths work on all platforms (Windows, macOS, Linux)
2. **Wikilink ambiguity**: Multiple notes with same name
3. **Large vaults**: Performance optimization needed
4. **File watching**: Changes not detected immediately

## Performance Optimization

### Indexing
- Build in-memory index on startup
- Use efficient search algorithms (trie, inverted index)
- Cache frequently accessed notes

### Lazy Loading
- Don't load all notes into memory
- Stream search results
- Paginate large result sets

### Concurrent Operations
- Use Promise.all for parallel file reads
- Implement connection pooling if needed
- Consider worker threads for CPU-intensive operations

## Git Workflow

### Branch Strategy
- `main`: Stable releases
- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Development branches: `claude/claude-md-*` (for AI assistant work)

### Commits
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Write clear, descriptive commit messages
- Keep commits focused and atomic

### Pull Requests
- Include description of changes
- Reference related issues
- Ensure tests pass
- Update documentation

## Documentation Standards

### Code Comments
- Document complex algorithms
- Explain non-obvious behavior
- Include examples for public APIs
- Use JSDoc for TypeScript documentation

### README.md
- Installation instructions
- Configuration guide
- Usage examples
- Troubleshooting section

### API Documentation
- Document all MCP tools
- Include input schemas
- Provide example requests/responses
- Note any limitations or edge cases

## Dependencies

### Production Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^0.5.0",
  "gray-matter": "^4.0.3",
  "glob": "^10.3.10"
}
```

### Development Dependencies
```json
{
  "@types/node": "^20.11.0",
  "typescript": "^5.3.3",
  "vitest": "^1.2.0",
  "@types/jest": "^29.5.0"
}
```

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Run full test suite
4. Build and verify artifacts
5. Tag release: `git tag v1.0.0`
6. Push to repository
7. Publish to npm (if public)

## Resources for AI Assistants

### Understanding MCP
- Model Context Protocol specification: https://modelcontextprotocol.io
- MCP SDK documentation
- Example MCP servers in the SDK repository

### Obsidian Documentation
- Obsidian help: https://help.obsidian.md
- Obsidian plugin API (for understanding vault structure)
- Community conventions for wikilinks and tags

### TypeScript Resources
- TypeScript handbook: https://www.typescriptlang.org/docs/
- Node.js documentation: https://nodejs.org/docs/

## AI Assistant Guidelines

### When Working on This Project

1. **Read existing code first**: Use Read tool to understand current implementation
2. **Follow conventions**: Match existing code style and patterns
3. **Test your changes**: Run tests before committing
4. **Update documentation**: Keep README and CLAUDE.md in sync
5. **Ask for clarification**: If requirements are unclear, ask the user

### Common Tasks

#### Adding a New Tool
1. Define tool schema in `src/tools/`
2. Implement handler function
3. Register tool with MCP server
4. Add tests in `tests/tools/`
5. Update README with tool documentation

#### Fixing a Bug
1. Reproduce the issue
2. Write a failing test
3. Fix the issue
4. Verify test passes
5. Check for similar issues elsewhere

#### Refactoring
1. Ensure tests exist for code being refactored
2. Make incremental changes
3. Run tests after each change
4. Keep commits small and focused

## Current Status

This is a new project implementing a comprehensive unified MCP server specification with 40+ tools, SQLite provenance, advanced search, and knowledge workflows.

---

# UNIFIED IMPLEMENTATION SPECIFICATION

## 1. Purpose & Scope

### 1.1 Problem
The system solves **knowledge fragmentation** between:
* Conversations (LLM, chat, meetings)
* Obsidian notes (multiple vaults, personal/work)
* Decisions/projects (esp. GRC/IT contexts)

Current issues:
* High-signal conversations do **not** reliably become atomic notes.
* Notes are inconsistent in:
  * Structure (frontmatter, types, PARA)
  * Connections (links, backlinks, semantic relations)
  * Evolution (evergreen updates, decision history)
* Multi-vault separation (personal vs work) is based on **instructions**, not enforced policy.
* MCP tools:
  * Have inconsistent names & return shapes.
  * Mix human-formatted text and JSON.
  * Lack DB-backed provenance.
  * Don't guarantee Obsidian-flavored Markdown.

### 1.2 Goals
1. **Coherence-preserving knowledge engine** over one or more Obsidian vaults:
   * Note types (`atomic | evergreen | decision | project | framework | journal`)
   * PARA (`project | area | resource | archive`)
   * Lifecycle stage (`capture | process | connect | synthesize | crystallize`)
   * Coherence IDs (conversation/insight/decision/concept).
2. **Stable JSON MCP API** consumable by:
   * Claude via STDIO MCP
   * ChatGPT MCP (same binary, different config).
3. **Non-Git provenance**:
   * SQLite `note_history` with `actor`, `source`, `requestId`, hashes, optional diff.
4. **Obsidian-flavored Markdown**:
   * Use **obsidian-linter** as canonical formatter and rules engine.
5. **High-quality search**:
   * **Regex+** for safe regex and structural parsing.
   * **uFuzzy** for fuzzy search over content/titles/tags.
   * **fuzzysort** for Sublime-style path/name search.
6. **Health & metrics**:
   * Connection density, orphan rate (true orphans), evergreen velocity, decision hygiene, optional lint hygiene.

---

## 2. Architecture Overview

### 2.1 Components
1. **MCP Server (Node/TypeScript)**
   * Single CLI binary: `obsidian-knowledge-mcp`.
   * Speaks MCP over STDIN/STDOUT.
   * Hosts all tools (no protocol branching per client).

2. **Vault Layer**
   * Vault config:
     ```ts
     type VaultConfig = {
       id: string;
       name: string;
       path: string;
       enabled: boolean;
       classification?: 'personal' | 'work';
     };
     ```
   * `FileOperations` abstraction over the filesystem.
   * Frontmatter parser/serializer (YAML).
   * Note type inference from frontmatter and/or path.

3. **SQLite Database**
   * Existing file index.
   * New / extended tables:
     * `note_history` (provenance)
     * `concepts`, `concept_notes`
     * `decisions`
     * `metrics` (optional cached health stats).

4. **Search Engine Layer**
   * Dedicated module (e.g. `src/search/engine.ts`) providing:
     * `searchNotesExact` (Regex+)
     * `searchNotesFuzzy` (uFuzzy)
     * `searchPathsFuzzy` (fuzzysort)
     * `suggestLinkTargets` (fuzzysort + optional uFuzzy).

5. **Linting Engine (Obsidian Linter integration)**
   * Integrate **obsidian-linter** as a library:
     ```ts
     type LintSettings = any; // from obsidian-linter
     type RuleResult = { ruleId: string; message: string; ... };
     function lintMarkdown(
       content: string,
       settings: LintSettings
     ): { fixed: string; diagnostics: RuleResult[] };
     ```
   * Load per-vault config from `.obsidian/plugins/obsidian-linter/data.json`.

6. **Knowledge Engine**
   * Conversation processor.
   * Knowledge/insight extraction.
   * Concept indexer.
   * Evergreen & decision managers.
   * Health & connection analyzers.

7. **Config & Policy**
   * Vault classification and multi-vault policy.
   * Content standards (frontmatter schema, templates).
   * Linter & search configuration.
   * Tool-layer policy enforcement (e.g. cross-vault restrictions).

---

## 3. Data Model & Schema

### 3.1 TypeScript Types (Notes)
```ts
export type NoteRef = {
  vault: string;         // vault id from config
  path: string;          // vault-relative, e.g. "Evergreen/Networking/Latency.md"
};

export type NoteMetadata = {
  created?: string;
  updated?: string;
  tags?: string[];
  type?: 'atomic' | 'evergreen' | 'decision' | 'project'
       | 'framework' | 'journal' | string;
  para?: 'project' | 'area' | 'resource' | 'archive' | string;
  stage?: 'capture' | 'process' | 'connect'
        | 'synthesize' | 'crystallize' | string;
  status?: string;                      // draft | evergreen | needs-review | closed...
  confidence?: 'low' | 'medium' | 'high' | string;
  sizeBytes?: number;
};

export type NoteContent = NoteRef & {
  frontmatter: Record<string, any> | null;
  body: string;            // markdown without frontmatter
  raw: string;             // entire file content
  metadata?: NoteMetadata;
};
```

### 3.2 Canonical Frontmatter Fields
Target (not all required at once, but this is the schema tools should converge toward):
```yaml
type: atomic | evergreen | decision | project | framework | journal
para: project | area | resource | archive
stage: capture | process | connect | synthesize | crystallize
created: 2025-11-18
updated: 2025-11-19
tags:
  - Domain/Networking
  - Category/Latency
  - Quality/Evergreen
status: draft | evergreen | needs-review | closed
confidence: low | medium | high
conversation_id: conv-2025-11-18-01
insight_id: atom-2025-11-18-001
decision_id: dec-2025-11-18-01
concept_ids:
  - concept-001
  - concept-002
source: process-conversation:conv-2025-11-18-01
```

These fields are the primary interoperability surface across tools, Dataview, and workflows.

### 3.3 Database Schema

#### `note_history`
```sql
CREATE TABLE note_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vault       TEXT NOT NULL,
  path        TEXT NOT NULL,
  timestamp   TEXT NOT NULL,  -- ISO
  operation   TEXT NOT NULL,  -- 'create' | 'update' | 'patch' | 'append' | 'delete' | 'batch'
  tool        TEXT NOT NULL,  -- MCP tool name
  actor       TEXT NOT NULL,  -- 'user' | 'llm' | 'system'
  source      TEXT,
  request_id  TEXT,
  prev_hash   TEXT,
  new_hash    TEXT NOT NULL,
  diff        BLOB            -- optional serialized diff
);
```

#### `concepts` / `concept_notes`
```sql
CREATE TABLE concepts (
  concept_id  TEXT PRIMARY KEY,
  term        TEXT NOT NULL,
  normalized  TEXT NOT NULL,
  frequency   INTEGER NOT NULL
);

CREATE TABLE concept_notes (
  concept_id  TEXT NOT NULL,
  vault       TEXT NOT NULL,
  path        TEXT NOT NULL,
  score       REAL NOT NULL,
  PRIMARY KEY (concept_id, vault, path)
);
```

#### `decisions`
```sql
CREATE TABLE decisions (
  decision_id   TEXT PRIMARY KEY,
  vault         TEXT NOT NULL,
  path          TEXT NOT NULL,
  status        TEXT NOT NULL,   -- proposed|accepted|rejected|superseded
  date          TEXT,
  review_date   TEXT,
  depends_on    TEXT,            -- JSON array of decision_ids
  supersedes    TEXT             -- JSON array of decision_ids
);
```

#### `metrics` (optional)
```sql
CREATE TABLE metrics (
  vault        TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  computed_at  TEXT NOT NULL,
  value_json   TEXT NOT NULL,
  PRIMARY KEY (vault, metric_name)
);
```

---

## 4. MCP Tool Conventions

### 4.1 Envelope & Errors
All tools follow the same envelope:
```ts
export type ToolError = {
  code: string;
  message: string;
  details?: any;
};

export type ToolResponse<T> = {
  status: 'ok' | 'error';
  data?: T;
  error?: ToolError;
  meta?: {
    tool: string;
    vault?: string;
    requestId?: string;
    timestamp: string; // ISO
  };
};
```

### 4.2 Provenance
All write-like tools **must** accept:
```ts
source?: string;                 // workflow context, e.g. "process-conversation:conv-2025-11-18-01"
actor?: 'user' | 'llm' | 'system';
requestId?: string;              // idempotency token
```

And **must**:
* Compute `prev_hash` / `new_hash` of file content.
* Insert a `note_history` row per real change.
* Be idempotent for same `(vault, path, requestId)`.

### 4.3 Search Stack Usage
* **Regex+**:
  * All regex construction (search, parsing, tag extraction, links, anchors).
* **uFuzzy**:
  * Fuzzy matching over note titles, tags, and content fingerprints.
* **fuzzysort**:
  * Fuzzy matching over file paths/names.
* Tool placement (see §5.2).

### 4.4 Linting Integration
* obsidian-linter is the canonical Markdown formatting engine.
* Exposed standalone via:
  * `lint-note`
  * `lint-folder`
* Write tools (`create-note`, `update-note`, `evergreen-note`, `decision-log`, `process-conversation`) get:
```ts
autoLint?: boolean; // default from vault/server config
```
If enabled, the tool:
1. Writes the new content.
2. Immediately runs lint in "fix" mode.
3. Writes fixed content, but **only one** `note_history` row is recorded for the whole change.

---

## 5. Tool Reference

### 5.0 Tool Inventory Overview
**Core notes & files**
* `list-vaults`
* `list-files-in-vault`
* `list-files-in-dir`
* `read-note`
* `create-note`
* `update-note`
* `patch-content`
* `append-content`
* `delete-file`
* `get-note-history`

**Search & discovery**
* `search-vault`
* `fuzzy-search`
* `find-similar-notes`
* `find-content-clusters`
* `find-frequent-pairs`
* `find-co-citation`
* `find-broken-links`
* `extract-concepts`
* `find-by-concept`
* `find-concept-variations`
* `analyze-tags`
* `get-activity-timeline`
* `find-temporal-related`
* `find-temporal-clusters`
* `analyze-connections`

**Dataview & batch**
* `execute-dataview-query`
* `batch-operations`

**Knowledge workflows**
* `extract-knowledge`
* `process-conversation`
* `evergreen-note`
* `decision-log`

**Linting**
* `lint-note`
* `lint-folder`

**Health & admin**
* `index-status`
* `rebuild-index`
* `verify-database`
* `vault-health-enhanced`
* `get-server-status`

---

### 5.1 Core Notes & Files

#### 5.1.1 `list-vaults`
```ts
type ListVaultsInput = {};
type ListVaultsOutput = {
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
};
```

#### 5.1.2 `list-files-in-vault`
```ts
type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  sizeBytes?: number;
  created?: string;
  modified?: string;
  score?: number;  // fuzzysort score if filterQuery used
};

type ListFilesInVaultInput = {
  vault: string;
  includeMetadata?: boolean;  // default false
  notesOnly?: boolean;        // default true
  filterQuery?: string;       // optional fuzzy filter via fuzzysort
};

type ListFilesInVaultOutput = {
  vault: string;
  entries: FileEntry[];
};
```

#### 5.1.3 `list-files-in-dir`
```ts
type ListFilesInDirInput = {
  vault: string;
  directory: string;     // e.g. "Evergreen/Networking"
  includeMetadata?: boolean;
  notesOnly?: boolean;
  filterQuery?: string;
};

type ListFilesInDirOutput = ListFilesInVaultOutput;
```

#### 5.1.4 `read-note` (replaces `get-file-contents`)
```ts
type ReadNoteInput = NoteRef & {
  includeRaw?: boolean;         // default true
  includeBody?: boolean;        // default true
  includeFrontmatter?: boolean; // default true
};

type ReadNoteOutput = NoteContent;
```

Behavior:
* Only valid for `.md`; otherwise error `UNSUPPORTED_TYPE`.
* Parses YAML frontmatter; splits body.
* Populates `metadata` from frontmatter + FS stat.

#### 5.1.5 `create-note`
```ts
type CreateNoteInput = {
  vault: string;
  path: string;
  frontmatter?: Record<string, any>;
  body?: string;
  templateId?: string;
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type CreateNoteOutput = {
  note: NoteContent;
  created: boolean; // false if file already existed and not modified
};
```

Behavior:
* Applies defaults for `type/para/stage` based on template/path.
* Writes file, updates index.
* Optionally lints.
* Writes `note_history` (operation=`create`).

#### 5.1.6 `update-note`
```ts
type UpdateNoteInput = {
  vault: string;
  path: string;
  newFrontmatter?: Record<string, any>;
  newBody?: string;
  mergeFrontmatterStrategy?: 'replace' | 'merge'; // default 'merge'
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type UpdateNoteOutput = {
  note: NoteContent;
  previousHash: string;
  newHash: string;
  historyEntryId: number;
};
```

Behavior:
* Reads current note.
* Applies merge/replace semantics for frontmatter.
* Writes file only if content changed; lints if enabled.
* Inserts `note_history` with `operation='update'`.

#### 5.1.7 `patch-content`
```ts
type PatchContentInput = {
  vault: string;
  path: string;
  anchorType: 'heading' | 'block' | 'frontmatter';
  anchorValue: string;
  content: string;
  position?: 'before' | 'after' | 'replace'; // default 'after'
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type PatchContentOutput = {
  note: NoteRef;
  newSizeBytes: number;
  previousHash: string;
  newHash: string;
  historyEntryId: number;
};
```

Anchors (headings, blocks, frontmatter keys) should be located using Regex+ helpers, not ad-hoc regex.

#### 5.1.8 `append-content`
```ts
type AppendContentInput = {
  vault: string;
  path: string;
  content: string;
  createIfNotExists?: boolean; // default true
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type AppendContentOutput = {
  note: NoteRef;
  created: boolean;
  newSizeBytes: number;
  previousHash?: string;
  newHash: string;
  historyEntryId: number;
};
```

#### 5.1.9 `delete-file`
```ts
type DeleteFileInput = {
  vault: string;
  path: string;
  recursive?: boolean; // dirs only
  dryRun?: boolean;    // default false
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type DeleteFileOutput = {
  vault: string;
  path: string;
  deleted: boolean;
  isDirectory: boolean;
  wouldDeleteChildren?: FileEntry[]; // when dryRun
};
```

#### 5.1.10 `get-note-history`
```ts
type GetNoteHistoryInput = {
  vault: string;
  path: string;
  limit?: number;  // default 20
  offset?: number; // default 0
};

type NoteHistoryEntry = {
  id: number;
  timestamp: string;
  operation: 'create' | 'update' | 'patch' | 'append' | 'delete' | 'batch';
  tool: string;
  actor: 'user' | 'llm' | 'system';
  source?: string;
  requestId?: string;
  prevHash?: string;
  newHash: string;
};

type GetNoteHistoryOutput = {
  note: NoteRef;
  entries: NoteHistoryEntry[];
  pagination: { limit: number; offset: number; total?: number };
};
```

---

### 5.2 Search & Discovery

Shared type:
```ts
type SearchResult = NoteRef & {
  title: string;
  score: number;
  snippet?: string;
  tags?: string[];
  frontmatter?: Record<string, any>;
};
```

#### 5.2.1 `search-vault`
```ts
type SearchVaultInput = {
  vault: string;
  query: string;
  searchIn?: ('content' | 'frontmatter' | 'tags' | 'filename')[];
  limit?: number;
  offset?: number;
};

type SearchVaultOutput = {
  results: SearchResult[];
  totalEstimate?: number;
};
```

Behavior:
* Determine mode:
  * Regex-ish query → **exact** via Regex+.
  * Plain keywords → **hybrid**:
    * Regex+ term search.
    * uFuzzy over titles/tags/content fingerprints.
* Merge exact and fuzzy results, dedupe, highest scores first.

#### 5.2.2 `fuzzy-search`
```ts
type FuzzySearchInput = {
  vault: string;
  query: string;
  searchIn?: ('content' | 'frontmatter' | 'tags' | 'filename')[];
  limit?: number;
  offset?: number;
  fuzzyThreshold?: number; // 0..1
};

type FuzzySearchOutput = SearchVaultOutput;
```

Behavior:
* If `searchIn` is only `filename` → fuzzysort on paths/names.
* If includes content/frontmatter/tags → uFuzzy over note text & metadata.
* If mixed → run both and merge.

#### 5.2.3 `find-similar-notes`
```ts
type FindSimilarNotesInput = {
  vault: string;
  path: string;
  limit?: number;
  includeSharedTerms?: boolean;
};

type SimilarNote = SearchResult & {
  sharedTerms?: string[];
};

type FindSimilarNotesOutput = {
  anchor: NoteRef;
  results: SimilarNote[];
};
```

Implementation can combine semantic, term, and tag similarity.

#### 5.2.4 `find-content-clusters`
```ts
type FindContentClustersInput = {
  vault: string;
  minClusterSize?: number; // default 3
  maxClusters?: number;    // default 20
};

type ContentCluster = {
  id: string;
  label?: string;
  notes: SearchResult[];
};

type FindContentClustersOutput = {
  clusters: ContentCluster[];
};
```

#### 5.2.5 `find-frequent-pairs` / `find-co-citation`
```ts
type NotePair = {
  a: SearchResult;
  b: SearchResult;
  coCitationCount: number;
  score: number;
};

type FindNotePairsOutput = {
  pairs: NotePair[];
};
```

Inputs vary by filters (min coCitation count, limit, etc.).

#### 5.2.6 `find-broken-links`
```ts
type FindBrokenLinksInput = {
  vault: string;
  limit?: number;
  offset?: number;
};

type BrokenLink = {
  source: NoteRef;
  linkText: string;
  linkRaw: string;
  suggestions: SearchResult[];
};

type FindBrokenLinksOutput = {
  brokenLinks: BrokenLink[];
  pagination: { limit: number; offset: number; total?: number };
};
```

Behavior:
* Extract links (wikilinks, etc.) via Regex+.
* For unresolved targets, fuzzysort against paths/titles to populate `suggestions`.

#### 5.2.7 Concepts & Tags
```ts
type Concept = {
  term: string;
  normalized: string;
  frequency: number;
  variants?: string[];
};

type ExtractConceptsInput = { vault: string; paths?: string[] };
type ExtractConceptsOutput = { concepts: Concept[] };

type FindByConceptInput = {
  vault: string;
  concept: string;
  limit?: number;
};

type FindByConceptOutput = {
  concept: Concept;
  notes: SearchResult[];
};

type FindConceptVariationsInput = {
  vault: string;
  concept: string;
};

type FindConceptVariationsOutput = {
  concept: Concept;
};
```

`analyze-tags` / temporal tools standardize on structured shapes (tag stats, timelines, clusters) and always refer to notes using `SearchResult`.

#### 5.2.8 `analyze-connections`
```ts
type AnalyzeConnectionsInput = {
  vault: string;
  paths?: string[];
  limitSuggestions?: number;
};

type ConnectionSuggestion = {
  from: NoteRef;
  to: NoteRef;
  score: number;
  reasons: string[]; // e.g. ["high semantic similarity", "shared tags", "same day edits"]
};

type AnalyzeConnectionsOutput = {
  suggestions: ConnectionSuggestion[];
};
```

---

### 5.3 Dataview & Batch

#### 5.3.1 `execute-dataview-query`
```ts
type DataviewRow = {
  file: NoteRef & { title: string };
  fields: Record<string, any>;
};

type ExecuteDataviewQueryInput = {
  vault: string;
  query: string;                   // DQL
  format?: 'table' | 'list' | 'task' | 'raw';
};

type ExecuteDataviewQueryOutput = {
  resultType: 'table' | 'list' | 'task' | 'raw';
  columns?: string[];
  rows?: DataviewRow[];
  raw?: any;
};
```

#### 5.3.2 `batch-operations`
```ts
type BatchOperation =
  | { type: 'update-frontmatter'; path: string; changes: Record<string, any> }
  | { type: 'add-tags'; path: string; tags: string[] }
  | { type: 'remove-tags'; path: string; tags: string[] }
  | { type: 'move-file'; path: string; newPath: string }
  | { type: 'apply-template'; path: string; templateId: string };

type BatchOperationsInput = {
  vault: string;
  operations: BatchOperation[];
  dryRun?: boolean;  // default true
  maxItems?: number; // default ~20
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type BatchOperationResult = {
  operation: BatchOperation;
  success: boolean;
  error?: string;
};

type BatchOperationsOutput = {
  results: BatchOperationResult[];
};
```

Batch writes must also write aggregated `note_history` entries per note.

---

### 5.4 Knowledge Workflows

#### 5.4.1 `extract-knowledge`
```ts
type AtomicInsight = {
  id: string;
  summary: string;
  detail?: string;
  tags?: string[];
  confidence: 'low' | 'medium' | 'high';
  sourceSpans?: { start: number; end: number }[];
};

type ExtractKnowledgeInput = {
  sourceText: string;
  context?: {
    vault?: string;
    origin?: 'conversation' | 'note' | 'document';
    originRef?: NoteRef | { id: string; type: string };
    date?: string;
  };
};

type ExtractKnowledgeOutput = {
  insights: AtomicInsight[];
};
```

#### 5.4.2 `process-conversation`
```ts
type ProcessConversationInput = {
  vault: string;
  conversationId: string;
  rawTranscript: string;
  timestamp?: string;
  minInsights?: number;
  skipIfLowSignal?: boolean;
  createEvergreenCandidates?: boolean;
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type ProcessConversationOutput = {
  archived: NoteRef;          // conversation archive
  atomicNotes: NoteRef[];     // created atomic notes
  dailyNote?: NoteRef;
  evergreenCandidates?: NoteRef[];
  insightsCount: number;
  skipped: boolean;
  reasonIfSkipped?: string;
};
```

Semantics:
* Archive note:
  * `type: journal` or `conversation`
  * `stage: capture`
  * `conversation_id` set.
* Atomic notes:
  * `type: atomic`
  * `stage: process`
  * `insight_id` + `conversation_id` set.

#### 5.4.3 `evergreen-note`
```ts
type EvergreenNoteInput = {
  vault: string;
  path: string;
  title?: string;
  summary?: string;
  body?: string;
  status?: 'draft' | 'evergreen' | 'needs-review';
  confidence?: 'low' | 'medium' | 'high';
  sources?: NoteRef[] | string[];
  tags?: string[];
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type EvergreenNoteOutput = {
  note: NoteContent;
  created: boolean;
};
```

Behavior:
* Force `type: evergreen`, `stage: synthesize`.
* Append/evolve content rather than overwrite whole note.
* Maintain/update `sources`, `updated`, `confidence`.

#### 5.4.4 `decision-log`
```ts
type DecisionLogInput = {
  vault: string;
  path?: string;
  decisionId?: string;
  title: string;
  context: string;
  options: { name: string; pros: string[]; cons: string[] }[];
  decision: string;
  rationale: string;
  date?: string;
  reviewDate?: string;
  status?: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  dependsOn?: string[];
  supersedes?: string[];
  tags?: string[];
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type DecisionLogOutput = {
  note: NoteContent;
};
```

Behavior:
* `type: decision`, `stage: crystallize`.
* Persist decision metadata in frontmatter and `decisions` table.

---

### 5.5 Linting

#### 5.5.1 `lint-note`
```ts
type LintNoteInput = {
  vault: string;
  path: string;
  applyFixes?: boolean;  // default true
  rules?: string[];      // optional subset of linter rules
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type LintDiagnostic = {
  ruleId: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  location?: { line: number; column?: number };
};

type LintNoteOutput = {
  note: NoteRef;
  originalHash: string;
  newHash: string;
  changed: boolean;
  appliedRules: string[];
  diagnostics: LintDiagnostic[];
};
```

Behavior:
* Read note content.
* Load vault linter config.
* Run linter:
  * If `applyFixes` → update file and `note_history` (tool=`lint-note`).
  * Else → diagnostics only.

#### 5.5.2 `lint-folder`
```ts
type LintFolderInput = {
  vault: string;
  directory?: string;   // default entire vault
  applyFixes?: boolean; // default false
  rules?: string[];
  limit?: number;       // optional safety cap
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};

type LintFolderResult = {
  note: NoteRef;
  changed: boolean;
  appliedRules: string[];
  diagnostics: LintDiagnostic[];
  error?: string;
};

type LintFolderOutput = {
  results: LintFolderResult[];
};
```

---

### 5.6 Health & Admin

#### 5.6.1 `index-status`
```ts
type IndexStatusInput = {
  vault: string;
};

type IndexStatusOutput = {
  vault: { id: string; name: string; path: string };
  indexedFileCount: number;
  physicalMarkdownCount: number;
  lastIndexedAt?: string;
  needsRebuild: boolean;
  database: {
    path: string;
    exists: boolean;
    sizeBytes?: number;
    journalMode?: string;
    pageCount?: number;
    pageSize?: number;
  };
};
```

#### 5.6.2 `rebuild-index`
```ts
type RebuildIndexInput = {
  vault: string;
  force?: boolean;
};

type RebuildIndexOutput = {
  vault: { id: string; name: string };
  beforeCount: number;
  afterCount: number;
  durationMs: number;
};
```

#### 5.6.3 `verify-database`
```ts
type VerifyDatabaseInput = {};

type VerifyDatabaseOutput = {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  integrityOk: boolean;
  issues?: string[];
};
```

#### 5.6.4 `vault-health-enhanced`
```ts
type VaultHealthEnhancedInput = {
  vault: string;
  enableAtomicNoteAnalysis?: boolean;
  checkOrphans?: boolean;
  enableFuzzyConnections?: boolean;
};

type VaultHealthStats = {
  totalNotes: number;
  atomicNotes: number;
  evergreenNotes: number;
  decisionLogs: number;
  trueOrphans: number;
  orphanPercentage: number;
  avgBacklinksPerNote: number;
  evergreenUpdateMedianDays?: number;
  overdueDecisions?: number;
  lintIssuesSampled?: number; // optional
};

type VaultHealthEnhancedOutput = {
  vault: { id: string; name: string };
  stats: VaultHealthStats;
  recommendations: string[];
};
```

#### 5.6.5 `get-server-status`
```ts
type GetServerStatusInput = {};

type GetServerStatusOutput = {
  version: string;
  startedAt: string;
  vaults: Array<{
    id: string;
    name: string;
    path: string;
    enabled: boolean;
    indexedFileCount: number;
    lastIndexedAt?: string;
    needsRebuild: boolean;
  }>;
  database: {
    path: string;
    exists: boolean;
    sizeBytes?: number;
    integrityOk: boolean;
    issues?: string[];
  };
};
```

---

## 6. Workflows (End-to-End)

### 6.1 Conversation → Atomics → Evergreen → Decision
1. **Capture**
   * Client calls `process-conversation`.
   * Server:
     * Creates conversation archive (`type: journal|conversation`, `stage: capture`, `conversation_id`).
     * Extracts insights -> `atomic` notes (`stage: process`, `insight_id`, `conversation_id`).
     * Updates daily/journal note.
     * Optionally lints all created notes.

2. **Connect**
   * Client uses `analyze-connections`, `find-similar-notes`, `find-by-concept`, `analyze-tags` against new atomics.

3. **Synthesize**
   * Client calls `evergreen-note` to create/evolve evergreen notes.
   * `type: evergreen`, `stage: synthesize`, `sources` referencing atomics + conversations.

4. **Crystallize**
   * When decisions are made, client calls `decision-log`.
   * Decision frontmatter + `decisions` table record, possibly with dependency graph.

5. **Provenance**
   * All steps create `note_history` entries with tool, actor, source, hashes.

### 6.2 Weekly Vault Health
1. `get-server-status` to confirm environment.
2. `vault-health-enhanced` per vault to inspect:
   * Orphan rate, connection density, evergreen velocity, decision hygiene, optional lint hygiene.
3. Use `execute-dataview-query` to retrieve candidate notes.
4. Use `batch-operations` (`dryRun` first) for structural fixes.
5. Use `lint-folder` for formatting fixes.
6. Re-run `vault-health-enhanced` to validate improvements.

### 6.3 Multi-Vault Policy
* Each vault has `classification: personal | work`.
* Tool layer enforces policy:
  * Direct copy work→personal is blocked or forced into abstract summary mode.
* Cross-vault flow:
  * Use `extract-knowledge` on work content.
  * Write only abstracted notes into personal vault (`source: "abstract:work"`, no sensitive details).

---

# EPIC-BASED IMPLEMENTATION PLAN

## Epic 0 – Baseline & Core Types
**Goal:** Capture current behavior and introduce shared types.

* **0.1 Capture current behavior & tool inventory**
  * Enumerate current MCP tools, input/output, side effects.
  * Produce doc with:
    * Current tool list.
    * Input/Output JSON schemas.
    * Mapping table: `current_name → new_name` + semantic changes.

* **0.2 Introduce shared TypeScript core types**
  * Add module `types/core.ts` with:
    * `NoteRef`, `NoteContent`, `NoteMetadata`
    * `SearchResult`
    * `ToolResponse<T>`, `ToolError`
  * Refactor new code to use these types exclusively.

---

## Epic 1 – Core Platform & Provenance
**Goal:** DB-backed history and structured note I/O.

* **1.1 `note_history` table**
  * Migration for existing DBs to create `note_history`.
  * Helper functions:
    * `recordHistoryEntry(...)`
    * `computeNoteHash(content: string): string`

* **1.2 `read-note`**
  * Implement new tool and deprecate `get-file-contents`.
  * Parse frontmatter/body via Regex+ parsing helpers.

* **1.3 `update-note`**
  * Implement semantic update API with merge/replace semantics.
  * Integrate provenance, hashing, `note_history`.

* **1.4 Provenance on all writes**
  * Extend:
    * `create-note`, `patch-content`, `append-content`, `delete-file`,
      `batch-operations`, `evergreen-note`, `decision-log`, `process-conversation`
  * Add `actor`, `source`, `requestId`.
  * Implement idempotency on `requestId`.

* **1.5 `get-note-history`**
  * Query and paginate `note_history` for a given note.

---

## Epic 2 – Search, Connections, Concepts (Regex+ / uFuzzy / fuzzysort)
**Goal:** High-quality, consistent search & connection tools.

* **2.1 Search engine module**
  * `src/search/engine.ts`:
    * Encapsulate Regex+, uFuzzy, fuzzysort usage.

* **2.2 Standardize `SearchResult`**
  * Refactor `search-vault`, `fuzzy-search` to use `SearchResult`.
  * Remove any text-formatted search payloads.

* **2.3 Implement hybrid `search-vault`**
  * Regex+ exact + uFuzzy fuzzy with merging.

* **2.4 Modernize `fuzzy-search`**
  * uFuzzy for content/tags.
  * fuzzysort for filenames/paths.

* **2.5 Fuzzy file selection**
  * Add `filterQuery` to `list-files-in-vault` / `list-files-in-dir`.
  * Use fuzzysort to rank results.

* **2.6 Improve `find-broken-links`**
  * Regex+ for link extraction.
  * fuzzysort for target suggestions.

* **2.7 Concepts pipeline**
  * Implement/complete `concepts` & `concept_notes` tables.
  * Wire `extract-concepts`, `find-by-concept`, `find-concept-variations`.
  * Use Regex+ for extraction & uFuzzy for similarity.

* **2.8 Temporal & tag tools**
  * Standard shapes for:
    * `analyze-tags`
    * `get-activity-timeline`
    * `find-temporal-related`
    * `find-temporal-clusters`
  * Ensure responses always reference notes via `SearchResult`.

* **2.9 `analyze-connections`**
  * Implement `ConnectionSuggestion` with `reasons[]`.

---

## Epic 3 – Pipeline, Note Semantics & Templates
**Goal:** Encode note types, PARA, stages, and coherence IDs across workflows.

* **3.1 Frontmatter schema & validation**
  * Implement constants/enums for:
    * `type`, `para`, `stage`, `status`, `confidence`
    * Coherence IDs: `conversation_id`, `insight_id`, `decision_id`, `concept_ids[]`, `source`
  * Add validation helper:
    * `validateFrontmatter(fm) -> { ok: boolean; errors?: string[] }`

* **3.2 `create-note` defaults**
  * Path-based and template-based defaults for type/para/stage.

* **3.3 Template manager**
  * Implement `template-manager` or equivalent module:
    * Templates classified by `type` and `para`.

* **3.4 `process-conversation` pipeline behavior**
  * Ensure correct `type`/`stage`/IDs for archives + atomics.
  * Link to daily/journal note.

* **3.5 `evergreen-note` evolution**
  * Incremental updates; append rather than overwrite.
  * Maintain `sources`, `updated`, `confidence`.

* **3.6 `decision-log` graph**
  * Decision IDs, dependencies, supersedes, status/review fields.
  * Persist to `decisions` table.

---

## Epic 4 – Linter Integration
**Goal:** Obsidian-style Markdown formatting and lint hygiene.

* **4.1 Vendor/integrate obsidian-linter**
  * Adapt linter core for CLI use.
  * Implement `lintMarkdown(content, settings)` adapter.

* **4.2 `lint-note` tool**
  * Implement diagnostics + optional fixes.
  * Wire to `note_history` with tool=`lint-note`.

* **4.3 `lint-folder`**
  * Batch wrapper over `lint-note`.
  * Default `applyFixes=false`.

* **4.4 autoLint integration**
  * Add `autoLint` to write tools.
  * Single combined history entry per logical change.

* **4.5 Lint metrics**
  * Optionally sample notes in health checks:
    * report `% with diagnostics` as `lintIssuesSampled`.

---

## Epic 5 – Health, Metrics, Multi-Vault Policy
**Goal:** Robust health tools and codified multi-vault rules.

* **5.1 `vault-health-enhanced` metrics**
  * Implement:
    * Total type counts (atomic, evergreen, decision).
    * True orphan logic (ignoring atomics where appropriate).
    * Average backlinks.
    * Evergreen median update days.
    * Overdue decisions count.
    * Optional lint hygiene sample.

* **5.2 `get-server-status`**
  * Implement server snapshot for startup.

* **5.3 Multi-vault policy enforcement**
  * Extend vault config with `classification`.
  * Add policy enforcement in write tools:
    * `POLICY_VIOLATION` error for disallowed cross-vault flows.
  * Implement safe abstract-only flows where allowed.

* **5.4 Normalize index/admin tools**
  * Ensure `index-status`, `rebuild-index`, `verify-database` follow the spec shapes.
  * Add error codes for missing vault, DB issues.

---

## Epic 6 – MCP Integration, Docs & Tests
**Goal:** Wire STDIO MCP, finalize contracts, and guard with tests.

* **6.1 STDIO MCP entrypoint**
  * Implement CLI `obsidian-knowledge-mcp`.
  * Hook up MCP protocol via stdin/stdout.
  * Support environment/config for vaults, DB, logging, search, linter.

* **6.2 Client configs**
  * `claude.mcp.json` for Anthropic MCP.
  * ChatGPT MCP config with same binary and env.

* **6.3 Tool metadata & manifests**
  * Ensure tool registration reflects the unified schemas.

* **6.4 Migration guide**
  * Document:
    * `get-file-contents` → `read-note`.
    * Search result shape changes.
    * Linter behavior.
    * Provenance semantics.

* **6.5 Integration tests**
  * Fixture vault(s) to cover:
    * Conversation → archive → atomics → evergreen.
    * Decision with dependencies/supersede.
    * Weekly health + Dataview + batch-operations.
    * Lint-note / lint-folder flows.

---

**Note for AI Assistants**: This CLAUDE.md file should be kept up-to-date as the project evolves. When you make significant changes to the codebase structure, conventions, or workflow, update this file accordingly.
