/**
 * Database schema types and table definitions
 */

import { Actor, NoteOperation } from './core.js';

// ============================================================================
// Note History Table
// ============================================================================

/**
 * Note history table row
 */
export interface NoteHistoryRow {
  id: number;
  vault: string;
  path: string;
  timestamp: string; // ISO
  operation: NoteOperation;
  tool: string;
  actor: Actor;
  source: string | null;
  request_id: string | null;
  prev_hash: string | null;
  new_hash: string;
  diff: Buffer | null; // Serialized diff
}

/**
 * Insert parameters for note history
 */
export interface NoteHistoryInsert {
  vault: string;
  path: string;
  timestamp: string;
  operation: NoteOperation;
  tool: string;
  actor: Actor;
  source?: string;
  request_id?: string;
  prev_hash?: string;
  new_hash: string;
  diff?: Buffer;
}

// ============================================================================
// Concepts Tables
// ============================================================================

/**
 * Concepts table row
 */
export interface ConceptRow {
  concept_id: string;
  term: string;
  normalized: string;
  frequency: number;
}

/**
 * Concept-notes junction table row
 */
export interface ConceptNoteRow {
  concept_id: string;
  vault: string;
  path: string;
  score: number;
}

// ============================================================================
// Decisions Table
// ============================================================================

/**
 * Decisions table row
 */
export interface DecisionRow {
  decision_id: string;
  vault: string;
  path: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  date: string | null;
  review_date: string | null;
  depends_on: string | null; // JSON array of decision_ids
  supersedes: string | null; // JSON array of decision_ids
}

// ============================================================================
// Metrics Table
// ============================================================================

/**
 * Metrics table row
 */
export interface MetricRow {
  vault: string;
  metric_name: string;
  computed_at: string;
  value_json: string; // JSON-serialized metric value
}

// ============================================================================
// File Index Table (existing)
// ============================================================================

/**
 * File index table row (existing table from prior implementation)
 */
export interface FileIndexRow {
  id: number;
  vault: string;
  path: string;
  name: string;
  ext: string;
  size_bytes: number;
  created: string;
  modified: string;
  indexed_at: string;
  content_hash: string | null;
}

// ============================================================================
// SQL Schema Definitions
// ============================================================================

/**
 * SQL statements for creating database tables
 */
export const SCHEMA_SQL = {
  /**
   * Note history table for provenance tracking
   */
  NOTE_HISTORY: `
    CREATE TABLE IF NOT EXISTS note_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vault       TEXT NOT NULL,
      path        TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      operation   TEXT NOT NULL,
      tool        TEXT NOT NULL,
      actor       TEXT NOT NULL,
      source      TEXT,
      request_id  TEXT,
      prev_hash   TEXT,
      new_hash    TEXT NOT NULL,
      diff        BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_note_history_vault_path
      ON note_history(vault, path);
    CREATE INDEX IF NOT EXISTS idx_note_history_timestamp
      ON note_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_note_history_request_id
      ON note_history(request_id);
  `,

  /**
   * Concepts table for concept extraction
   */
  CONCEPTS: `
    CREATE TABLE IF NOT EXISTS concepts (
      concept_id  TEXT PRIMARY KEY,
      term        TEXT NOT NULL,
      normalized  TEXT NOT NULL,
      frequency   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_concepts_normalized
      ON concepts(normalized);
  `,

  /**
   * Concept-notes junction table
   */
  CONCEPT_NOTES: `
    CREATE TABLE IF NOT EXISTS concept_notes (
      concept_id  TEXT NOT NULL,
      vault       TEXT NOT NULL,
      path        TEXT NOT NULL,
      score       REAL NOT NULL,
      PRIMARY KEY (concept_id, vault, path),
      FOREIGN KEY (concept_id) REFERENCES concepts(concept_id)
    );

    CREATE INDEX IF NOT EXISTS idx_concept_notes_vault_path
      ON concept_notes(vault, path);
  `,

  /**
   * Decisions table for decision tracking
   */
  DECISIONS: `
    CREATE TABLE IF NOT EXISTS decisions (
      decision_id   TEXT PRIMARY KEY,
      vault         TEXT NOT NULL,
      path          TEXT NOT NULL,
      status        TEXT NOT NULL,
      date          TEXT,
      review_date   TEXT,
      depends_on    TEXT,
      supersedes    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_vault_path
      ON decisions(vault, path);
    CREATE INDEX IF NOT EXISTS idx_decisions_status
      ON decisions(status);
    CREATE INDEX IF NOT EXISTS idx_decisions_review_date
      ON decisions(review_date);
  `,

  /**
   * Metrics table for cached health stats
   */
  METRICS: `
    CREATE TABLE IF NOT EXISTS metrics (
      vault        TEXT NOT NULL,
      metric_name  TEXT NOT NULL,
      computed_at  TEXT NOT NULL,
      value_json   TEXT NOT NULL,
      PRIMARY KEY (vault, metric_name)
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_computed_at
      ON metrics(computed_at);
  `,

  /**
   * File index table (existing)
   */
  FILE_INDEX: `
    CREATE TABLE IF NOT EXISTS file_index (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      vault        TEXT NOT NULL,
      path         TEXT NOT NULL,
      name         TEXT NOT NULL,
      ext          TEXT NOT NULL,
      size_bytes   INTEGER NOT NULL,
      created      TEXT NOT NULL,
      modified     TEXT NOT NULL,
      indexed_at   TEXT NOT NULL,
      content_hash TEXT,
      UNIQUE(vault, path)
    );

    CREATE INDEX IF NOT EXISTS idx_file_index_vault
      ON file_index(vault);
    CREATE INDEX IF NOT EXISTS idx_file_index_ext
      ON file_index(ext);
    CREATE INDEX IF NOT EXISTS idx_file_index_modified
      ON file_index(modified);
  `
};

/**
 * Database migration versions
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * All database migrations in order
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: SCHEMA_SQL.FILE_INDEX
  },
  {
    version: 2,
    name: 'add_note_history',
    up: SCHEMA_SQL.NOTE_HISTORY
  },
  {
    version: 3,
    name: 'add_concepts',
    up: SCHEMA_SQL.CONCEPTS + '\n' + SCHEMA_SQL.CONCEPT_NOTES
  },
  {
    version: 4,
    name: 'add_decisions',
    up: SCHEMA_SQL.DECISIONS
  },
  {
    version: 5,
    name: 'add_metrics',
    up: SCHEMA_SQL.METRICS
  }
];
