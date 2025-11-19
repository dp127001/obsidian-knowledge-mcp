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
