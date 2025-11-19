/**
 * decision-log tool implementation
 * Creates and manages ADR-style decision records
 */

import { ServerContext } from '../server.js';
import { NoteContent, ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter, serializeFrontmatter } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { CanonicalFrontmatter, generateCoherenceId, DECISION_STATUSES } from '../vault/frontmatter-schema.js';

export interface DecisionLogInput extends ProvenanceFields {
  vault: string;
  title: string;
  path?: string; // Optional custom path
  status?: typeof DECISION_STATUSES[number]; // proposed, accepted, rejected, superseded
  context?: string; // What is the issue motivating this decision?
  decision?: string; // What is the change we're proposing/doing?
  consequences?: string; // What becomes easier or harder?
  alternatives?: string; // What other options were considered?
  dependsOn?: string[]; // Paths to other decision notes
  supersedes?: string[]; // Paths to decisions this supersedes
  reviewDate?: string; // ISO date for review
  tags?: string[];
  updateExisting?: boolean; // If true, update existing decision
}

export interface DecisionLogOutput {
  note: NoteContent;
  decisionId: string;
  created: boolean;
}

/**
 * Generate decision note number
 */
async function getNextDecisionNumber(fileOps: FileOperations): Promise<number> {
  try {
    const files = await fileOps.listFiles('decisions/', {
      recursive: false,
      notesOnly: true,
      includeMetadata: false
    });

    // Extract numbers from filenames like "0001-decision-title.md"
    const numbers = files
      .map(f => {
        const match = f.path.match(/\/(\d{4})-/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Handle decision-log tool call
 */
export async function handleDecisionLog(
  context: ServerContext,
  args: DecisionLogInput
): Promise<ToolResponse<DecisionLogOutput>> {
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

    if (!args.title) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_TITLE',
          message: 'title parameter is required'
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

    const timestamp = new Date().toISOString();
    const decisionDate = timestamp.split('T')[0]; // YYYY-MM-DD

    // Determine path
    let notePath: string;
    let decisionNumber: number;

    if (args.path) {
      notePath = args.path;
      // Try to extract number from path
      const match = args.path.match(/\/(\d{4})-/);
      decisionNumber = match ? parseInt(match[1], 10) : await getNextDecisionNumber(fileOps);
    } else {
      // Generate ADR-style path
      decisionNumber = await getNextDecisionNumber(fileOps);
      const slug = args.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      notePath = `decisions/${String(decisionNumber).padStart(4, '0')}-${slug}.md`;
    }

    // Generate decision ID
    const decisionId = generateCoherenceId('decision', String(decisionNumber));

    // Check if updating existing note
    const exists = await fileOps.fileExists(notePath);

    if (exists && !args.updateExisting) {
      return {
        status: 'error',
        error: {
          code: 'FILE_EXISTS',
          message: `File already exists: ${notePath}. Set updateExisting=true to update.`
        }
      };
    }

    let frontmatter: CanonicalFrontmatter;
    let body: string;
    let prevHash: string | undefined;
    let operation: 'create' | 'update';

    if (exists && args.updateExisting) {
      // Update existing decision
      operation = 'update';
      const existingContent = await fileOps.readFile(notePath);
      const parsed = parseFrontmatter(existingContent);

      prevHash = computeHash(existingContent);

      frontmatter = {
        ...(parsed.frontmatter as CanonicalFrontmatter),
        updated: timestamp,
        status: args.status || parsed.frontmatter?.status || 'proposed'
      };

      // Update fields if provided
      if (args.dependsOn) {
        frontmatter.depends_on = args.dependsOn;
      }
      if (args.supersedes) {
        frontmatter.supersedes = args.supersedes;
      }
      if (args.reviewDate) {
        frontmatter.review_date = args.reviewDate;
      }
      if (args.tags) {
        const existingTags = frontmatter.tags || [];
        frontmatter.tags = Array.from(new Set([...existingTags, ...args.tags]));
      }

      // Update body sections
      body = parsed.body;

      if (args.context) {
        body = body.replace(
          /## Context\n\n.*?\n\n##/s,
          `## Context\n\n${args.context}\n\n##`
        );
      }
      if (args.decision) {
        body = body.replace(
          /## Decision\n\n.*?\n\n##/s,
          `## Decision\n\n${args.decision}\n\n##`
        );
      }
      if (args.consequences) {
        body = body.replace(
          /## Consequences\n\n.*?\n\n##/s,
          `## Consequences\n\n${args.consequences}\n\n##`
        );
      }
      if (args.alternatives) {
        body = body.replace(
          /## Alternatives Considered\n\n.*?\n\n/s,
          `## Alternatives Considered\n\n${args.alternatives}\n\n`
        );
      }
    } else {
      // Create new decision
      operation = 'create';

      frontmatter = {
        type: 'decision',
        decision_id: decisionId,
        title: args.title,
        created: timestamp,
        updated: timestamp,
        decision_date: decisionDate,
        status: args.status || 'proposed',
        stage: 'crystallize',
        tags: args.tags || ['decision'],
        source: args.source,
        depends_on: args.dependsOn || [],
        supersedes: args.supersedes || [],
        review_date: args.reviewDate
      };

      // Generate ADR-style body
      body = `# ${args.title}

## Status

**${frontmatter.status}** - ${decisionDate}

## Context

${args.context || 'What is the issue we\'re seeing that is motivating this decision or change?'}

## Decision

${args.decision || 'What is the change that we\'re proposing and/or doing?'}

## Consequences

${args.consequences || 'What becomes easier or more difficult to do because of this change?'}

## Alternatives Considered

${args.alternatives || 'What other options were considered?'}
`;

      // Add dependencies section if present
      if (args.dependsOn && args.dependsOn.length > 0) {
        body += `\n## Dependencies\n\n${args.dependsOn.map(d => `- [[${d}]]`).join('\n')}\n`;
      }

      // Add supersedes section if present
      if (args.supersedes && args.supersedes.length > 0) {
        body += `\n## Supersedes\n\n${args.supersedes.map(s => `- [[${s}]]`).join('\n')}\n`;
      }

      // Add review date if present
      if (args.reviewDate) {
        body += `\n## Review Date\n\n${args.reviewDate}\n`;
      }
    }

    // Serialize and write
    const content = serializeFrontmatter(frontmatter as Record<string, any>, body);
    await fileOps.writeFile(notePath, content);

    // Record provenance
    const newHash = computeHash(content);
    context.db.recordHistory({
      vault: args.vault,
      path: notePath,
      timestamp,
      operation,
      tool: 'decision-log',
      actor: args.actor || 'llm',
      source: args.source,
      request_id: args.requestId,
      prev_hash: prevHash,
      new_hash: newHash
    });

    // If this decision supersedes others, update their status
    if (args.supersedes && args.supersedes.length > 0 && !exists) {
      for (const supersededPath of args.supersedes) {
        try {
          const supersededContent = await fileOps.readFile(supersededPath);
          const supersededParsed = parseFrontmatter(supersededContent);

          const updatedFrontmatter = {
            ...supersededParsed.frontmatter,
            status: 'superseded',
            updated: timestamp
          };

          const updatedContent = serializeFrontmatter(
            updatedFrontmatter,
            supersededParsed.body
          );

          await fileOps.writeFile(supersededPath, updatedContent);

          const supersededHash = computeHash(updatedContent);
          context.db.recordHistory({
            vault: args.vault,
            path: supersededPath,
            timestamp,
            operation: 'update',
            tool: 'decision-log',
            actor: args.actor || 'llm',
            source: `Superseded by ${notePath}`,
            request_id: undefined,
            prev_hash: computeHash(supersededContent),
            new_hash: supersededHash
          });
        } catch (error) {
          // Skip if superseded note can't be updated
          continue;
        }
      }
    }

    // Read back and return
    const finalContent = await fileOps.readFile(notePath);
    const finalParsed = parseFrontmatter(finalContent);

    return {
      status: 'ok',
      data: {
        note: {
          vault: args.vault,
          path: notePath,
          frontmatter: finalParsed.frontmatter,
          body: finalParsed.body,
          raw: finalContent
        },
        decisionId,
        created: !exists
      },
      meta: {
        tool: 'decision-log',
        vault: args.vault,
        requestId: args.requestId,
        timestamp
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'DECISION_LOG_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
