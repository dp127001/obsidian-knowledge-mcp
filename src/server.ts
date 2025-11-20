/**
 * MCP Server implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig } from './config/index.js';
import { KnowledgeDatabase } from './database/index.js';
import { ToolResponse } from './types/core.js';

// Import tool handlers
import { handleListVaults } from './tools/list-vaults.js';
import { handleReadNote } from './tools/read-note.js';
import { handleCreateNote } from './tools/create-note.js';
import { handleUpdateNote } from './tools/update-note.js';
import { handleAppendContent } from './tools/append-content.js';
import { handlePatchContent } from './tools/patch-content.js';
import { handleDeleteFile } from './tools/delete-file.js';
import { handleGetNoteHistory } from './tools/get-note-history.js';
import { handleSearchVault } from './tools/search-vault.js';
import { handleFuzzySearch } from './tools/fuzzy-search.js';
import { handleListFilesInVault } from './tools/list-files-in-vault.js';
import { handleListFilesInDir } from './tools/list-files-in-dir.js';
import { handleFindBrokenLinks } from './tools/find-broken-links.js';
import { handleExtractConcepts } from './tools/extract-concepts.js';
import { handleAnalyzeTags } from './tools/analyze-tags.js';
import { handleAnalyzeConnections } from './tools/analyze-connections.js';
import { handleProcessConversation } from './tools/process-conversation.js';
import { handleEvergreenNote } from './tools/evergreen-note.js';
import { handleDecisionLog } from './tools/decision-log.js';
import { handleLintNote } from './tools/lint-note.js';
import { handleLintFolder } from './tools/lint-folder.js';
import { handleVaultHealthEnhanced } from './tools/vault-health-enhanced.js';
import { handleGetServerStatus } from './tools/get-server-status.js';
import { handleIndexStatus } from './tools/index-status.js';
import { handleRebuildIndex } from './tools/rebuild-index.js';
import { handleVerifyDatabase } from './tools/verify-database.js';

/**
 * MCP Server context
 */
export interface ServerContext {
  config: ServerConfig;
  db: KnowledgeDatabase;
}

/**
 * Create and configure the MCP server
 */
export function createServer(context: ServerContext): Server {
  const server = new Server(
    {
      name: 'obsidian-knowledge-mcp',
      version: context.config.version
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Define available tools
  const tools: Tool[] = [
    {
      name: 'list-vaults',
      description: 'List all configured Obsidian vaults with their status and metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'read-note',
      description: 'Read a specific note from a vault, parsing frontmatter and body',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault ID'
          },
          path: {
            type: 'string',
            description: 'Note path relative to vault root (e.g., "Folder/Note.md")'
          },
          includeRaw: {
            type: 'boolean',
            description: 'Include raw file content (default: true)'
          },
          includeBody: {
            type: 'boolean',
            description: 'Include markdown body (default: true)'
          },
          includeFrontmatter: {
            type: 'boolean',
            description: 'Include parsed frontmatter (default: true)'
          }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'create-note',
      description: 'Create a new note in a vault with optional frontmatter and provenance tracking',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault ID'
          },
          path: {
            type: 'string',
            description: 'Note path relative to vault root'
          },
          frontmatter: {
            type: 'object',
            description: 'Frontmatter fields as key-value pairs'
          },
          body: {
            type: 'string',
            description: 'Markdown body content'
          },
          source: {
            type: 'string',
            description: 'Provenance source (e.g., "process-conversation:conv-123")'
          },
          actor: {
            type: 'string',
            enum: ['user', 'llm', 'system'],
            description: 'Actor creating the note'
          },
          requestId: {
            type: 'string',
            description: 'Idempotency token'
          }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'update-note',
      description: 'Update existing note with merge/replace frontmatter semantics and provenance tracking',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'Note path relative to vault root' },
          newFrontmatter: { type: 'object', description: 'New frontmatter fields' },
          newBody: { type: 'string', description: 'New markdown body content' },
          mergeFrontmatterStrategy: {
            type: 'string',
            enum: ['merge', 'replace'],
            description: 'How to merge frontmatter (default: merge)'
          },
          autoLint: { type: 'boolean', description: 'Apply linter automatically' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'append-content',
      description: 'Append content to an existing note or create if not exists',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'Note path' },
          content: { type: 'string', description: 'Content to append' },
          createIfNotExists: { type: 'boolean', description: 'Create file if missing (default: true)' },
          autoLint: { type: 'boolean', description: 'Apply linter automatically' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'path', 'content']
      }
    },
    {
      name: 'patch-content',
      description: 'Surgically update content at heading, block, or frontmatter anchor',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'Note path' },
          anchorType: {
            type: 'string',
            enum: ['heading', 'block', 'frontmatter'],
            description: 'Type of anchor'
          },
          anchorValue: { type: 'string', description: 'Anchor identifier (heading text, block ID, or frontmatter key)' },
          content: { type: 'string', description: 'Content to insert/replace' },
          position: {
            type: 'string',
            enum: ['before', 'after', 'replace'],
            description: 'Where to place content (default: after)'
          },
          autoLint: { type: 'boolean', description: 'Apply linter automatically' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'path', 'anchorType', 'anchorValue', 'content']
      }
    },
    {
      name: 'delete-file',
      description: 'Delete file or directory with provenance tracking',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'File or directory path' },
          recursive: { type: 'boolean', description: 'Allow directory deletion (required for directories)' },
          dryRun: { type: 'boolean', description: 'Preview what would be deleted (default: false)' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'get-note-history',
      description: 'Get provenance history for a note with pagination',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'Note path' },
          limit: { type: 'number', description: 'Max entries to return (default: 20)' },
          offset: { type: 'number', description: 'Number of entries to skip (default: 0)' }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'search-vault',
      description: 'Search for notes in a vault using hybrid exact and fuzzy matching',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          query: { type: 'string', description: 'Search query' },
          searchIn: {
            type: 'array',
            items: { type: 'string', enum: ['content', 'frontmatter', 'tags', 'filename'] },
            description: 'Where to search (default: content)'
          },
          limit: { type: 'number', description: 'Max results (default: 20)' },
          offset: { type: 'number', description: 'Results offset (default: 0)' }
        },
        required: ['vault', 'query']
      }
    },
    {
      name: 'fuzzy-search',
      description: 'Fuzzy search for notes using approximate string matching',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          query: { type: 'string', description: 'Search query' },
          searchIn: {
            type: 'array',
            items: { type: 'string', enum: ['content', 'frontmatter', 'tags', 'filename'] },
            description: 'Where to search'
          },
          limit: { type: 'number', description: 'Max results' },
          offset: { type: 'number', description: 'Results offset' },
          fuzzyThreshold: { type: 'number', description: 'Minimum score threshold (0-1)' }
        },
        required: ['vault', 'query']
      }
    },
    {
      name: 'list-files-in-vault',
      description: 'List files in a vault with optional fuzzy filtering',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          includeMetadata: { type: 'boolean', description: 'Include file metadata' },
          notesOnly: { type: 'boolean', description: 'Only markdown files (default: true)' },
          filterQuery: { type: 'string', description: 'Fuzzy filter query' }
        },
        required: ['vault']
      }
    },
    {
      name: 'list-files-in-dir',
      description: 'List files in a specific directory within a vault',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          directory: { type: 'string', description: 'Directory path (e.g., "Evergreen/Networking")' },
          includeMetadata: { type: 'boolean', description: 'Include file metadata' },
          notesOnly: { type: 'boolean', description: 'Only markdown files (default: true)' },
          filterQuery: { type: 'string', description: 'Fuzzy filter query' },
          recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' }
        },
        required: ['vault', 'directory']
      }
    },
    {
      name: 'find-broken-links',
      description: 'Find broken wikilinks in vault with suggestions for fixes',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          limit: { type: 'number', description: 'Max broken links to return' },
          offset: { type: 'number', description: 'Results offset' }
        },
        required: ['vault']
      }
    },
    {
      name: 'extract-concepts',
      description: 'Extract and rank concepts from notes in a vault',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: specific note paths to analyze'
          }
        },
        required: ['vault']
      }
    },
    {
      name: 'analyze-tags',
      description: 'Analyze tag usage across vault with frequency statistics',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          minCount: { type: 'number', description: 'Minimum tag count to include' }
        },
        required: ['vault']
      }
    },
    {
      name: 'analyze-connections',
      description: 'Suggest connections between notes based on similarity',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: specific notes to analyze'
          },
          limitSuggestions: { type: 'number', description: 'Max suggestions per note' }
        },
        required: ['vault']
      }
    },
    {
      name: 'process-conversation',
      description: 'Convert conversations into structured atomic notes with coherence IDs',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          conversation: {
            description: 'Conversation as array of messages or raw text'
          },
          conversationTitle: { type: 'string', description: 'Title for conversation note' },
          outputPath: { type: 'string', description: 'Base path for generated notes (default: conversations/)' },
          extractInsights: { type: 'boolean', description: 'Extract atomic insights (default: true)' },
          insightsPath: { type: 'string', description: 'Path for insights (default: atomic/)' },
          strategy: {
            type: 'string',
            enum: ['manual', 'auto'],
            description: 'Manual: just save conversation, Auto: extract insights'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to apply to generated notes'
          },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'conversation']
      }
    },
    {
      name: 'evergreen-note',
      description: 'Create or update evergreen notes by synthesizing atomic notes',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          title: { type: 'string', description: 'Note title' },
          path: { type: 'string', description: 'Path for new evergreen note' },
          sourceNotes: {
            type: 'array',
            description: 'Atomic notes to synthesize'
          },
          body: { type: 'string', description: 'Manual body content' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to apply'
          },
          updateExisting: { type: 'boolean', description: 'If true, update existing note at path' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'title']
      }
    },
    {
      name: 'decision-log',
      description: 'Create or update ADR-style decision records',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          title: { type: 'string', description: 'Decision title' },
          path: { type: 'string', description: 'Optional custom path' },
          status: {
            type: 'string',
            enum: ['proposed', 'accepted', 'rejected', 'superseded'],
            description: 'Decision status'
          },
          context: { type: 'string', description: 'What is the issue motivating this decision?' },
          decision: { type: 'string', description: 'What is the change we\'re proposing/doing?' },
          consequences: { type: 'string', description: 'What becomes easier or harder?' },
          alternatives: { type: 'string', description: 'What other options were considered?' },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to other decision notes'
          },
          supersedes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to decisions this supersedes'
          },
          reviewDate: { type: 'string', description: 'ISO date for review' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to apply'
          },
          updateExisting: { type: 'boolean', description: 'If true, update existing decision' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault', 'title']
      }
    },
    {
      name: 'lint-note',
      description: 'Lint a single note with optional automatic fixes',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          path: { type: 'string', description: 'Note path relative to vault root' },
          applyFixes: { type: 'boolean', description: 'Apply automatic fixes (default: false)' },
          lintSettings: {
            type: 'object',
            description: 'Linting configuration settings'
          },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token (only used if applyFixes=true)' }
        },
        required: ['vault', 'path']
      }
    },
    {
      name: 'lint-folder',
      description: 'Lint multiple notes in a folder with optional automatic fixes',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          folder: { type: 'string', description: 'Folder path (default: root)' },
          recursive: { type: 'boolean', description: 'Lint subdirectories (default: true)' },
          applyFixes: { type: 'boolean', description: 'Apply automatic fixes (default: false)' },
          lintSettings: {
            type: 'object',
            description: 'Linting configuration settings'
          },
          limit: { type: 'number', description: 'Max files to lint (default: 100)' },
          source: { type: 'string', description: 'Provenance source' },
          actor: { type: 'string', enum: ['user', 'llm', 'system'], description: 'Actor' },
          requestId: { type: 'string', description: 'Idempotency token' }
        },
        required: ['vault']
      }
    },
    {
      name: 'vault-health-enhanced',
      description: 'Get comprehensive health metrics for a vault including type counts, orphans, backlinks, evergreen metrics, decision metrics, and optional lint hygiene sampling',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' },
          sampleLintHygiene: { type: 'boolean', description: 'Sample notes for lint issues (default: false)' },
          lintSampleSize: { type: 'number', description: 'Number of notes to sample for linting (default: 20)' }
        },
        required: ['vault']
      }
    },
    {
      name: 'get-server-status',
      description: 'Get server snapshot including version, vaults, database status, and system information',
      inputSchema: {
        type: 'object',
        properties: {
          includeSystemInfo: { type: 'boolean', description: 'Include OS/system details (default: true)' }
        }
      }
    },
    {
      name: 'index-status',
      description: 'Check search index status for a vault',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' }
        },
        required: ['vault']
      }
    },
    {
      name: 'rebuild-index',
      description: 'Force rebuild of search index for a vault',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string', description: 'Vault ID' }
        },
        required: ['vault']
      }
    },
    {
      name: 'verify-database',
      description: 'Verify database integrity and check for issues',
      inputSchema: {
        type: 'object',
        properties: {
          checkIntegrity: { type: 'boolean', description: 'Run SQLite integrity check (default: true)' },
          checkOrphans: { type: 'boolean', description: 'Check for orphaned entries (default: true)' }
        }
      }
    }
  ];

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: ToolResponse<any>;

      switch (name) {
        case 'list-vaults':
          result = await handleListVaults(context, args || {});
          break;

        case 'read-note':
          result = await handleReadNote(context, (args || {}) as any);
          break;

        case 'create-note':
          result = await handleCreateNote(context, (args || {}) as any);
          break;

        case 'update-note':
          result = await handleUpdateNote(context, (args || {}) as any);
          break;

        case 'append-content':
          result = await handleAppendContent(context, (args || {}) as any);
          break;

        case 'patch-content':
          result = await handlePatchContent(context, (args || {}) as any);
          break;

        case 'delete-file':
          result = await handleDeleteFile(context, (args || {}) as any);
          break;

        case 'get-note-history':
          result = await handleGetNoteHistory(context, (args || {}) as any);
          break;

        case 'search-vault':
          result = await handleSearchVault(context, (args || {}) as any);
          break;

        case 'fuzzy-search':
          result = await handleFuzzySearch(context, (args || {}) as any);
          break;

        case 'list-files-in-vault':
          result = await handleListFilesInVault(context, (args || {}) as any);
          break;

        case 'list-files-in-dir':
          result = await handleListFilesInDir(context, (args || {}) as any);
          break;

        case 'find-broken-links':
          result = await handleFindBrokenLinks(context, (args || {}) as any);
          break;

        case 'extract-concepts':
          result = await handleExtractConcepts(context, (args || {}) as any);
          break;

        case 'analyze-tags':
          result = await handleAnalyzeTags(context, (args || {}) as any);
          break;

        case 'analyze-connections':
          result = await handleAnalyzeConnections(context, (args || {}) as any);
          break;

        case 'process-conversation':
          result = await handleProcessConversation(context, (args || {}) as any);
          break;

        case 'evergreen-note':
          result = await handleEvergreenNote(context, (args || {}) as any);
          break;

        case 'decision-log':
          result = await handleDecisionLog(context, (args || {}) as any);
          break;

        case 'lint-note':
          result = await handleLintNote(context, (args || {}) as any);
          break;

        case 'lint-folder':
          result = await handleLintFolder(context, (args || {}) as any);
          break;

        case 'vault-health-enhanced':
          result = await handleVaultHealthEnhanced(context, (args || {}) as any);
          break;

        case 'get-server-status':
          result = await handleGetServerStatus(context, (args || {}) as any);
          break;

        case 'index-status':
          result = await handleIndexStatus(context, (args || {}) as any);
          break;

        case 'rebuild-index':
          result = await handleRebuildIndex(context, (args || {}) as any);
          break;

        case 'verify-database':
          result = await handleVerifyDatabase(context, (args || {}) as any);
          break;

        default:
          result = {
            status: 'error',
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Unknown tool: ${name}`
            }
          };
      }

      // Return result in MCP format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResult: ToolResponse<never> = {
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          }
        ]
      };
    }
  });

  return server;
}

/**
 * Run the MCP server
 */
export async function runServer(context: ServerContext): Promise<void> {
  const server = createServer(context);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('Obsidian Knowledge MCP Server running on stdio');
  console.error(`Version: ${context.config.version}`);
  console.error(`Vaults: ${context.config.vaults.map(v => v.name).join(', ')}`);
}
