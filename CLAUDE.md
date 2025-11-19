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

This is a new project. The initial implementation should focus on:

1. Basic MCP server setup with stdio transport
2. Core tools: `search_notes`, `read_note`, `list_tags`
3. Wikilink parsing and resolution
4. Frontmatter parsing
5. Integration with Claude Desktop

## Next Steps

When starting development:
1. Initialize Node.js project (`npm init`)
2. Install MCP SDK and dependencies
3. Set up TypeScript configuration
4. Implement basic MCP server
5. Add first tool (`read_note`)
6. Test with MCP Inspector
7. Iterate and add more tools

---

**Note for AI Assistants**: This CLAUDE.md file should be kept up-to-date as the project evolves. When you make significant changes to the codebase structure, conventions, or workflow, update this file accordingly.
