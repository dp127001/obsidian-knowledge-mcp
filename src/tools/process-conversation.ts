/**
 * process-conversation tool implementation
 * Converts conversations into structured atomic notes
 */

import { ServerContext } from '../server.js';
import { NoteRef, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { serializeFrontmatter } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { generateCoherenceId, CanonicalFrontmatter } from '../vault/frontmatter-schema.js';

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/**
 * Extracted insight
 */
export interface ExtractedInsight {
  title: string;
  content: string;
  tags?: string[];
  confidence?: 'low' | 'medium' | 'high';
}

export interface ProcessConversationInput extends ProvenanceFields {
  vault: string;
  conversation: ConversationMessage[] | string; // Array of messages or raw text
  conversationTitle?: string;
  outputPath?: string; // Base path for generated notes (default: 'conversations/')
  extractInsights?: boolean; // If true, extract atomic insights (default: true)
  insightsPath?: string; // Path for insights (default: 'atomic/')
  strategy?: 'manual' | 'auto'; // Manual: just save conversation, Auto: extract insights
  tags?: string[];
}

export interface ProcessConversationOutput {
  conversationNote: NoteRef;
  insights: NoteRef[];
  conversationId: string;
}

/**
 * Extract insights from conversation
 * Simple heuristic-based extraction - in production, could use LLM
 */
function extractInsightsFromConversation(
  conversation: ConversationMessage[] | string
): ExtractedInsight[] {
  const insights: ExtractedInsight[] = [];

  // Convert to messages if string
  let messages: ConversationMessage[];
  if (typeof conversation === 'string') {
    // Simple split by newlines - in production, parse more carefully
    const lines = conversation.split('\n').filter(l => l.trim());
    messages = lines.map(line => ({
      role: 'user' as const,
      content: line
    }));
  } else {
    messages = conversation;
  }

  // Extract key points from assistant messages
  // This is a simple heuristic - in production, use more sophisticated NLP or LLM
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;

    const content = msg.content;

    // Look for numbered lists (often indicate key points)
    const numberedPattern = /^\d+\.\s+(.+)$/gm;
    let match;
    while ((match = numberedPattern.exec(content)) !== null) {
      const point = match[1].trim();
      if (point.length > 20) { // Filter short items
        insights.push({
          title: point.substring(0, 50) + (point.length > 50 ? '...' : ''),
          content: point,
          confidence: 'medium'
        });
      }
    }

    // Look for bullet points
    const bulletPattern = /^[*-]\s+(.+)$/gm;
    while ((match = bulletPattern.exec(content)) !== null) {
      const point = match[1].trim();
      if (point.length > 20) {
        insights.push({
          title: point.substring(0, 50) + (point.length > 50 ? '...' : ''),
          content: point,
          confidence: 'low'
        });
      }
    }

    // Look for sentences with strong signal words
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);
    for (const sentence of sentences) {
      if (
        /\b(key|important|crucial|significant|note that|remember|insight)\b/i.test(sentence)
      ) {
        insights.push({
          title: sentence.substring(0, 50) + (sentence.length > 50 ? '...' : ''),
          content: sentence,
          confidence: 'medium'
        });
      }
    }
  }

  // Deduplicate by title
  const uniqueInsights = new Map<string, ExtractedInsight>();
  for (const insight of insights) {
    if (!uniqueInsights.has(insight.title)) {
      uniqueInsights.set(insight.title, insight);
    }
  }

  return Array.from(uniqueInsights.values()).slice(0, 10); // Limit to top 10
}

/**
 * Format conversation as markdown
 */
function formatConversation(conversation: ConversationMessage[] | string): string {
  if (typeof conversation === 'string') {
    return conversation;
  }

  let markdown = '';
  for (const msg of conversation) {
    const timestamp = msg.timestamp ? ` (${msg.timestamp})` : '';
    markdown += `## ${msg.role}${timestamp}\n\n${msg.content}\n\n`;
  }

  return markdown;
}

/**
 * Handle process-conversation tool call
 */
export async function handleProcessConversation(
  context: ServerContext,
  args: ProcessConversationInput
): Promise<ToolResponse<ProcessConversationOutput>> {
  try {
    // Validate inputs
    if (!args.vault) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_VAULT',
          message: 'vault parameter is required'
        }
      };
    }

    if (!args.conversation) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_CONVERSATION',
          message: 'conversation parameter is required'
        }
      };
    }

    // Check idempotency
    if (args.requestId && context.db.checkRequestIdExists(args.requestId)) {
      return {
        status: 'error',
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'Request ID already processed (idempotency check)'
        }
      };
    }

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Generate conversation ID
    const conversationId = generateCoherenceId('conversation');
    const timestamp = new Date().toISOString();

    // Determine strategy
    const strategy = args.strategy || 'auto';
    const extractInsights = args.extractInsights !== false && strategy === 'auto';

    // Create conversation note
    const conversationPath = args.outputPath || 'conversations/';
    const conversationTitle = args.conversationTitle || `Conversation ${conversationId}`;
    const conversationFilename = `${conversationPath}${conversationId}.md`;

    const conversationBody = formatConversation(args.conversation);

    const conversationFrontmatter: CanonicalFrontmatter = {
      type: 'journal',
      conversation_id: conversationId,
      created: timestamp,
      updated: timestamp,
      title: conversationTitle,
      tags: args.tags || ['conversation'],
      source: args.source,
      stage: 'capture'
    };

    const conversationContent = serializeFrontmatter(
      conversationFrontmatter as Record<string, any>,
      conversationBody
    );

    // Write conversation note
    await fileOps.writeFile(conversationFilename, conversationContent);

    // Record provenance
    const conversationHash = computeHash(conversationContent);
    context.db.recordHistory({
      vault: args.vault,
      path: conversationFilename,
      timestamp,
      operation: 'create',
      tool: 'process-conversation',
      actor: args.actor || 'llm',
      source: args.source,
      request_id: args.requestId,
      prev_hash: undefined,
      new_hash: conversationHash
    });

    const conversationNote: NoteRef = {
      vault: args.vault,
      path: conversationFilename
    };

    // Extract and create insight notes
    const insightNotes: NoteRef[] = [];

    if (extractInsights) {
      const insights = extractInsightsFromConversation(args.conversation);
      const insightsBasePath = args.insightsPath || 'atomic/';

      for (const insight of insights) {
        const insightId = generateCoherenceId('insight');
        const insightFilename = `${insightsBasePath}${insightId}.md`;

        const insightFrontmatter: CanonicalFrontmatter = {
          type: 'atomic',
          insight_id: insightId,
          conversation_id: conversationId,
          created: timestamp,
          updated: timestamp,
          title: insight.title,
          tags: insight.tags || ['insight', ...(args.tags || [])],
          confidence: insight.confidence || 'medium',
          source: args.source,
          stage: 'process'
        };

        const insightBody = `# ${insight.title}

## Insight

${insight.content}

## Context

Extracted from conversation: [[${conversationFilename}]]

## Next Steps

- Review and refine
- Connect to related notes
- Promote to evergreen if validated
`;

        const insightContent = serializeFrontmatter(
          insightFrontmatter as Record<string, any>,
          insightBody
        );

        // Write insight note
        await fileOps.writeFile(insightFilename, insightContent);

        // Record provenance
        const insightHash = computeHash(insightContent);
        context.db.recordHistory({
          vault: args.vault,
          path: insightFilename,
          timestamp,
          operation: 'create',
          tool: 'process-conversation',
          actor: args.actor || 'llm',
          source: args.source,
          request_id: args.requestId,
          prev_hash: undefined,
          new_hash: insightHash
        });

        insightNotes.push({
          vault: args.vault,
          path: insightFilename
        });
      }
    }

    return {
      status: 'ok',
      data: {
        conversationNote,
        insights: insightNotes,
        conversationId
      },
      meta: {
        tool: 'process-conversation',
        vault: args.vault,
        requestId: args.requestId,
        timestamp
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'PROCESS_CONVERSATION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
