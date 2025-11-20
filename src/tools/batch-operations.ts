/**
 * batch-operations tool implementation
 */

import { ServerContext } from '../server.js';
import { ProvenanceFields, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { handleUpdateNote } from './update-note.js';

/**
 * Batch operation types
 */
export type BatchOperation =
  | { type: 'update-frontmatter'; path: string; changes: Record<string, any> }
  | { type: 'add-tags'; path: string; tags: string[] }
  | { type: 'remove-tags'; path: string; tags: string[] }
  | { type: 'move-file'; path: string; newPath: string };
  // Note: apply-template deferred to future implementation

export interface BatchOperationsInput extends ProvenanceFields {
  vault: string;
  operations: BatchOperation[];
  dryRun?: boolean;  // default true
  maxItems?: number; // default 20
}

export interface BatchOperationResult {
  operation: BatchOperation;
  success: boolean;
  error?: string;
  affectedPath?: string; // For move operations
}

export interface BatchOperationsOutput {
  results: BatchOperationResult[];
  dryRun: boolean;
  successCount: number;
  errorCount: number;
}

/**
 * Handle batch-operations tool call
 */
export async function handleBatchOperations(
  context: ServerContext,
  args: BatchOperationsInput
): Promise<ToolResponse<BatchOperationsOutput>> {
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

    if (!args.operations || !Array.isArray(args.operations)) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_OPERATIONS',
          message: 'operations parameter is required and must be an array'
        }
      };
    }

    // Apply safety limit (default: 20)
    const maxItems = args.maxItems || 20;
    if (args.operations.length > maxItems) {
      return {
        status: 'error',
        error: {
          code: 'TOO_MANY_OPERATIONS',
          message: `Too many operations: ${args.operations.length}. Maximum allowed: ${maxItems}`
        }
      };
    }

    // Default to dry run for safety
    const dryRun = args.dryRun !== false;

    // Validate vault exists
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each operation
    for (const operation of args.operations) {
      try {
        const result = await processSingleOperation(
          context,
          fileOps,
          args.vault,
          operation,
          dryRun,
          args.source,
          args.actor,
          args.requestId
        );

        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          operation,
          success: false,
          error: errorMessage
        });
        errorCount++;
      }
    }

    return {
      status: 'ok',
      data: {
        results,
        dryRun,
        successCount,
        errorCount
      },
      meta: {
        tool: 'batch-operations',
        vault: args.vault,
        requestId: args.requestId,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'BATCH_OPERATIONS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}

/**
 * Process a single batch operation
 */
async function processSingleOperation(
  context: ServerContext,
  fileOps: FileOperations,
  vault: string,
  operation: BatchOperation,
  dryRun: boolean,
  source?: string,
  actor?: 'user' | 'llm' | 'system',
  requestId?: string
): Promise<BatchOperationResult> {
  // Check if file exists
  const exists = await fileOps.fileExists(operation.path);

  if (!exists) {
    return {
      operation,
      success: false,
      error: `File not found: ${operation.path}`
    };
  }

  if (dryRun) {
    // Dry run: just validate the operation
    return {
      operation,
      success: true
    };
  }

  // Execute the operation based on type
  switch (operation.type) {
    case 'update-frontmatter':
      return await executeUpdateFrontmatter(
        context,
        vault,
        operation.path,
        operation.changes,
        source,
        actor,
        requestId
      );

    case 'add-tags':
      return await executeAddTags(
        context,
        fileOps,
        vault,
        operation.path,
        operation.tags,
        source,
        actor,
        requestId
      );

    case 'remove-tags':
      return await executeRemoveTags(
        context,
        fileOps,
        vault,
        operation.path,
        operation.tags,
        source,
        actor,
        requestId
      );

    case 'move-file':
      return await executeMoveFile(
        context,
        fileOps,
        vault,
        operation.path,
        operation.newPath,
        source,
        actor,
        requestId
      );

    default:
      return {
        operation,
        success: false,
        error: `Unknown operation type: ${(operation as any).type}`
      };
  }
}

/**
 * Execute update-frontmatter operation
 */
async function executeUpdateFrontmatter(
  context: ServerContext,
  vault: string,
  path: string,
  changes: Record<string, any>,
  source?: string,
  actor?: 'user' | 'llm' | 'system',
  requestId?: string
): Promise<BatchOperationResult> {
  const operation: BatchOperation = { type: 'update-frontmatter', path, changes };

  try {
    const result = await handleUpdateNote(context, {
      vault,
      path,
      newFrontmatter: changes,
      mergeFrontmatterStrategy: 'merge',
      source: source || 'batch-operations',
      actor,
      requestId
    });

    if (result.status === 'error') {
      return {
        operation,
        success: false,
        error: result.error!.message
      };
    }

    return {
      operation,
      success: true
    };
  } catch (error) {
    return {
      operation,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute add-tags operation
 */
async function executeAddTags(
  context: ServerContext,
  fileOps: FileOperations,
  vault: string,
  path: string,
  tagsToAdd: string[],
  source?: string,
  actor?: 'user' | 'llm' | 'system',
  requestId?: string
): Promise<BatchOperationResult> {
  const operation: BatchOperation = { type: 'add-tags', path, tags: tagsToAdd };

  try {
    // Read current frontmatter
    const content = await fileOps.readFile(path);
    const parsed = parseFrontmatter(content);
    const frontmatter = parsed.frontmatter || {};

    // Get existing tags
    let currentTags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      currentTags = frontmatter.tags;
    } else if (typeof frontmatter.tags === 'string') {
      currentTags = [frontmatter.tags];
    }

    // Add new tags (avoid duplicates)
    const newTags = [...new Set([...currentTags, ...tagsToAdd])];

    // Update note
    const result = await handleUpdateNote(context, {
      vault,
      path,
      newFrontmatter: { tags: newTags },
      mergeFrontmatterStrategy: 'merge',
      source: source || 'batch-operations',
      actor,
      requestId
    });

    if (result.status === 'error') {
      return {
        operation,
        success: false,
        error: result.error!.message
      };
    }

    return {
      operation,
      success: true
    };
  } catch (error) {
    return {
      operation,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute remove-tags operation
 */
async function executeRemoveTags(
  context: ServerContext,
  fileOps: FileOperations,
  vault: string,
  path: string,
  tagsToRemove: string[],
  source?: string,
  actor?: 'user' | 'llm' | 'system',
  requestId?: string
): Promise<BatchOperationResult> {
  const operation: BatchOperation = { type: 'remove-tags', path, tags: tagsToRemove };

  try {
    // Read current frontmatter
    const content = await fileOps.readFile(path);
    const parsed = parseFrontmatter(content);
    const frontmatter = parsed.frontmatter || {};

    // Get existing tags
    let currentTags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      currentTags = frontmatter.tags;
    } else if (typeof frontmatter.tags === 'string') {
      currentTags = [frontmatter.tags];
    }

    // Remove specified tags
    const newTags = currentTags.filter(tag => !tagsToRemove.includes(tag));

    // Update note
    const result = await handleUpdateNote(context, {
      vault,
      path,
      newFrontmatter: { tags: newTags },
      mergeFrontmatterStrategy: 'merge',
      source: source || 'batch-operations',
      actor,
      requestId
    });

    if (result.status === 'error') {
      return {
        operation,
        success: false,
        error: result.error!.message
      };
    }

    return {
      operation,
      success: true
    };
  } catch (error) {
    return {
      operation,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute move-file operation
 */
async function executeMoveFile(
  context: ServerContext,
  fileOps: FileOperations,
  vault: string,
  oldPath: string,
  newPath: string,
  source?: string,
  actor?: 'user' | 'llm' | 'system',
  requestId?: string
): Promise<BatchOperationResult> {
  const operation: BatchOperation = { type: 'move-file', path: oldPath, newPath };

  try {
    // Check if target already exists
    const targetExists = await fileOps.fileExists(newPath);
    if (targetExists) {
      return {
        operation,
        success: false,
        error: `Target file already exists: ${newPath}`
      };
    }

    // Read current content for hash
    const content = await fileOps.readFile(oldPath);
    const prevHash = require('crypto').createHash('sha256').update(content).digest('hex');

    // Move the file
    await fileOps.moveFile(oldPath, newPath);

    // Record provenance for the move (as delete from old + create at new)
    context.db.recordHistory({
      vault,
      path: oldPath,
      timestamp: new Date().toISOString(),
      operation: 'delete',
      tool: 'batch-operations',
      actor: actor || 'llm',
      source: source || 'batch-operations:move',
      request_id: requestId,
      prev_hash: prevHash,
      new_hash: '' // Deleted
    });

    const newHash = require('crypto').createHash('sha256').update(content).digest('hex');

    context.db.recordHistory({
      vault,
      path: newPath,
      timestamp: new Date().toISOString(),
      operation: 'create',
      tool: 'batch-operations',
      actor: actor || 'llm',
      source: source || 'batch-operations:move',
      request_id: requestId,
      prev_hash: undefined,
      new_hash: newHash
    });

    return {
      operation,
      success: true,
      affectedPath: newPath
    };
  } catch (error) {
    return {
      operation,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
