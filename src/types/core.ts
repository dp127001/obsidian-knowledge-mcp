/**
 * Core type definitions for the Obsidian Knowledge MCP Server
 * These types form the foundation of all tool inputs and outputs
 */

// ============================================================================
// Note References and Content
// ============================================================================

/**
 * Reference to a note in a vault
 */
export interface NoteRef {
  /** Vault ID from config */
  vault: string;
  /** Vault-relative path, e.g. "Evergreen/Networking/Latency.md" */
  path: string;
}

/**
 * Metadata extracted from note frontmatter and filesystem
 */
export interface NoteMetadata {
  created?: string;
  updated?: string;
  tags?: string[];
  type?: NoteType | string;
  para?: ParaCategory | string;
  stage?: LifecycleStage | string;
  status?: string;
  confidence?: Confidence | string;
  sizeBytes?: number;
}

/**
 * Complete note content including frontmatter, body, and metadata
 */
export interface NoteContent extends NoteRef {
  /** Parsed frontmatter object (null if no frontmatter) */
  frontmatter: Record<string, any> | null;
  /** Markdown body without frontmatter */
  body: string;
  /** Complete file content including frontmatter */
  raw: string;
  /** Extracted and computed metadata */
  metadata?: NoteMetadata;
}

// ============================================================================
// Search Results
// ============================================================================

/**
 * Standard search result format used across all search tools
 */
export interface SearchResult extends NoteRef {
  /** Note title (from frontmatter or filename) */
  title: string;
  /** Relevance score (0-1 or arbitrary positive number) */
  score: number;
  /** Optional snippet showing match context */
  snippet?: string;
  /** Tags from frontmatter */
  tags?: string[];
  /** Frontmatter fields */
  frontmatter?: Record<string, any>;
}

// ============================================================================
// Enums and Constants
// ============================================================================

/**
 * Note type taxonomy
 */
export type NoteType =
  | 'atomic'      // Single insight or fact
  | 'evergreen'   // Synthesized, evolving knowledge
  | 'decision'    // Decision log with context
  | 'project'     // Project notes
  | 'framework'   // Mental models, frameworks
  | 'journal';    // Daily notes, conversations

/**
 * PARA methodology categories
 */
export type ParaCategory =
  | 'project'   // Active projects with deadlines
  | 'area'      // Areas of responsibility
  | 'resource'  // Reference material
  | 'archive';  // Inactive items

/**
 * Knowledge lifecycle stages
 */
export type LifecycleStage =
  | 'capture'      // Raw capture (conversations, fleeting notes)
  | 'process'      // Processed into atomic insights
  | 'connect'      // Connected to existing knowledge
  | 'synthesize'   // Synthesized into evergreen notes
  | 'crystallize'; // Crystallized into decisions/frameworks

/**
 * Confidence levels for insights and notes
 */
export type Confidence = 'low' | 'medium' | 'high';

/**
 * Actor types for provenance tracking
 */
export type Actor = 'user' | 'llm' | 'system';

/**
 * Note operations for provenance
 */
export type NoteOperation = 'create' | 'update' | 'patch' | 'append' | 'delete' | 'batch';

// ============================================================================
// Tool Response Envelope
// ============================================================================

/**
 * Standard error structure for tool responses
 */
export interface ToolError {
  /** Error code (e.g., VAULT_NOT_FOUND, INVALID_PATH) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: any;
}

/**
 * Standard response envelope for all MCP tools
 */
export interface ToolResponse<T> {
  /** Response status */
  status: 'ok' | 'error';
  /** Response data (present when status is 'ok') */
  data?: T;
  /** Error details (present when status is 'error') */
  error?: ToolError;
  /** Metadata about the operation */
  meta?: {
    /** Tool name */
    tool: string;
    /** Vault ID if applicable */
    vault?: string;
    /** Request ID for idempotency */
    requestId?: string;
    /** ISO timestamp */
    timestamp: string;
  };
}

// ============================================================================
// Provenance
// ============================================================================

/**
 * Provenance fields for write operations
 */
export interface ProvenanceFields {
  /** Workflow context, e.g., "process-conversation:conv-2025-11-18-01" */
  source?: string;
  /** Actor performing the operation */
  actor?: Actor;
  /** Idempotency token */
  requestId?: string;
}

// ============================================================================
// File Entries
// ============================================================================

/**
 * File or directory entry
 */
export interface FileEntry {
  /** File or directory name */
  name: string;
  /** Vault-relative path */
  path: string;
  /** Entry type */
  type: 'file' | 'directory';
  /** File extension (if file) */
  ext?: string;
  /** Size in bytes */
  sizeBytes?: number;
  /** Creation timestamp (ISO) */
  created?: string;
  /** Modification timestamp (ISO) */
  modified?: string;
  /** Fuzzy search score (if applicable) */
  score?: number;
}

// ============================================================================
// Concepts
// ============================================================================

/**
 * Extracted concept from notes
 */
export interface Concept {
  /** Concept term */
  term: string;
  /** Normalized form */
  normalized: string;
  /** Frequency across vault */
  frequency: number;
  /** Variant forms */
  variants?: string[];
}

// ============================================================================
// Vault Configuration
// ============================================================================

/**
 * Vault configuration
 */
export interface VaultConfig {
  /** Unique vault identifier */
  id: string;
  /** Human-readable vault name */
  name: string;
  /** Absolute filesystem path to vault */
  path: string;
  /** Whether vault is enabled */
  enabled: boolean;
  /** Vault classification for policy enforcement */
  classification?: 'personal' | 'work';
}

// ============================================================================
// History
// ============================================================================

/**
 * Note history entry from provenance tracking
 */
export interface NoteHistoryEntry {
  /** History entry ID */
  id: number;
  /** ISO timestamp */
  timestamp: string;
  /** Operation type */
  operation: NoteOperation;
  /** Tool that performed the operation */
  tool: string;
  /** Actor type */
  actor: Actor;
  /** Source context */
  source?: string;
  /** Request ID */
  requestId?: string;
  /** Previous content hash */
  prevHash?: string;
  /** New content hash */
  newHash: string;
}

// ============================================================================
// Pagination
// ============================================================================

/**
 * Pagination parameters and metadata
 */
export interface Pagination {
  /** Number of items to return */
  limit: number;
  /** Number of items to skip */
  offset: number;
  /** Total number of items (if known) */
  total?: number;
}
