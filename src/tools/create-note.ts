/**
 * create-note tool implementation
 */

import { ServerContext } from '../server.js';
import { NoteContent, ProvenanceFields, ToolResponse, NoteType, ParaCategory, LifecycleStage } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { serializeFrontmatter, parseFrontmatter, extractMetadata } from '../vault/frontmatter.js';
import { computeHash } from '../database/index.js';
import { createNoteFromTemplate, TemplateOptions } from '../templates/template-manager.js';
import { inferDefaultsFromPath, CanonicalFrontmatter } from '../vault/frontmatter-schema.js';
import { lintMarkdown } from '../linter/engine.js';

export interface CreateNoteInput extends ProvenanceFields {
  vault: string;
  path: string;
  frontmatter?: Record<string, any>;
  body?: string;
  // Template options
  type?: NoteType;
  para?: ParaCategory;
  stage?: LifecycleStage;
  title?: string;
  useTemplate?: boolean; // If true, apply template for the specified type
  inferFromPath?: boolean; // If true, infer type/para/stage from path (default: true)
  addCoherenceIds?: {
    conversation?: boolean;
    insight?: boolean;
    decision?: boolean;
    concept?: boolean;
  };
  autoLint?: boolean;
}

export interface CreateNoteOutput {
  note: NoteContent;
  created: boolean;
}

/**
 * Handle create-note tool call
 */
export async function handleCreateNote(
  context: ServerContext,
  args: CreateNoteInput
): Promise<ToolResponse<CreateNoteOutput>> {
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

    if (!args.path) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_PATH',
          message: 'path parameter is required'
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

    let frontmatter: Record<string, any>;
    let body: string;

    // Use template system if requested or if type is specified
    if (args.useTemplate || args.type) {
      const templateOptions: TemplateOptions = {
        type: args.type,
        para: args.para,
        stage: args.stage,
        title: args.title,
        addCoherenceIds: args.addCoherenceIds
      };

      const templateResult = createNoteFromTemplate(
        args.path,
        templateOptions,
        args.frontmatter as Partial<CanonicalFrontmatter>
      );

      frontmatter = templateResult.frontmatter as Record<string, any>;
      body = args.body || templateResult.body;
    } else {
      // Manual frontmatter specification
      frontmatter = args.frontmatter || {};
      body = args.body || '';

      // Infer defaults from path if enabled (default: true)
      if (args.inferFromPath !== false) {
        const pathDefaults = inferDefaultsFromPath(args.path);

        // Apply path defaults only if not already specified
        if (!frontmatter.type && pathDefaults.type) {
          frontmatter.type = pathDefaults.type;
        }
        if (!frontmatter.para && pathDefaults.para) {
          frontmatter.para = pathDefaults.para;
        }
        if (!frontmatter.stage && pathDefaults.stage) {
          frontmatter.stage = pathDefaults.stage;
        }
      }

      // Add created/updated timestamps if not present
      const now = new Date().toISOString();
      if (!frontmatter.created) {
        frontmatter.created = now;
      }
      if (!frontmatter.updated) {
        frontmatter.updated = now;
      }

      // Add title if provided
      if (args.title && !frontmatter.title) {
        frontmatter.title = args.title;
      }

      // Ensure tags array exists
      if (!frontmatter.tags) {
        frontmatter.tags = [];
      }
    }

    // Always add source if provided
    if (args.source && !frontmatter.source) {
      frontmatter.source = args.source;
    }

    // Serialize content
    let content = serializeFrontmatter(frontmatter, body);

    // Apply autoLint if requested
    if (args.autoLint) {
      const lintResult = await lintMarkdown(content, { applyFixes: true });
      if (lintResult.fixed) {
        content = lintResult.content;
      }
    }

    // Check if file already exists
    const fileOps = new FileOperations(vault.path);
    const exists = await fileOps.fileExists(args.path);

    if (exists) {
      return {
        status: 'error',
        error: {
          code: 'FILE_EXISTS',
          message: `File already exists: ${args.path}. Use update-note to modify existing files.`
        }
      };
    }

    // Write file
    await fileOps.writeFile(args.path, content);

    // Compute hash
    const newHash = computeHash(content);

    // Record provenance
    context.db.recordHistory({
      vault: args.vault,
      path: args.path,
      timestamp: new Date().toISOString(),
      operation: 'create',
      tool: 'create-note',
      actor: args.actor || 'llm',
      source: args.source,
      request_id: args.requestId,
      prev_hash: undefined,
      new_hash: newHash
    });

    // Read back the created file
    const stats = await fileOps.getFileStats(args.path);
    const parsed = parseFrontmatter(content);
    const metadata = extractMetadata(parsed.frontmatter, stats);

    const result: CreateNoteOutput = {
      note: {
        vault: args.vault,
        path: args.path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        raw: content,
        metadata
      },
      created: true
    };

    return {
      status: 'ok',
      data: result,
      meta: {
        tool: 'create-note',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'CREATE_NOTE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}
