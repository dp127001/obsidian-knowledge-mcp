/**
 * Database layer for SQLite operations
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { MIGRATIONS, NoteHistoryInsert, NoteHistoryRow } from '../types/database.js';
import { NoteHistoryEntry } from '../types/core.js';

/**
 * Database wrapper class
 */
export class KnowledgeDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  /**
   * Initialize database schema and run migrations
   */
  private initialize(): void {
    // Create migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Get current version
    const currentVersion = this.db
      .prepare('SELECT MAX(version) as version FROM migrations')
      .get() as { version: number | null };

    const version = currentVersion?.version || 0;

    // Apply pending migrations
    for (const migration of MIGRATIONS) {
      if (migration.version > version) {
        console.log(`Applying migration ${migration.version}: ${migration.name}`);
        this.db.exec(migration.up);
        this.db
          .prepare('INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString());
      }
    }
  }

  /**
   * Get database instance for raw queries
   */
  getRawDb(): Database.Database {
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // ========================================================================
  // Note History
  // ========================================================================

  /**
   * Record a note history entry
   */
  recordHistory(entry: NoteHistoryInsert): number {
    const stmt = this.db.prepare(`
      INSERT INTO note_history (
        vault, path, timestamp, operation, tool, actor,
        source, request_id, prev_hash, new_hash, diff
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.vault,
      entry.path,
      entry.timestamp,
      entry.operation,
      entry.tool,
      entry.actor,
      entry.source || null,
      entry.request_id || null,
      entry.prev_hash || null,
      entry.new_hash,
      entry.diff || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get note history with pagination
   */
  getNoteHistory(
    vault: string,
    path: string,
    limit: number = 20,
    offset: number = 0
  ): { entries: NoteHistoryEntry[]; total: number } {
    const rows = this.db
      .prepare(`
        SELECT * FROM note_history
        WHERE vault = ? AND path = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `)
      .all(vault, path, limit, offset) as NoteHistoryRow[];

    const countRow = this.db
      .prepare('SELECT COUNT(*) as count FROM note_history WHERE vault = ? AND path = ?')
      .get(vault, path) as { count: number };

    const entries: NoteHistoryEntry[] = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      operation: row.operation,
      tool: row.tool,
      actor: row.actor,
      source: row.source || undefined,
      requestId: row.request_id || undefined,
      prevHash: row.prev_hash || undefined,
      newHash: row.new_hash
    }));

    return {
      entries,
      total: countRow.count
    };
  }

  /**
   * Check if a request ID has already been processed (idempotency)
   */
  checkRequestIdExists(requestId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM note_history WHERE request_id = ? LIMIT 1')
      .get(requestId);
    return !!row;
  }

  /**
   * Get list of database tables
   */
  getTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];
    return rows.map(r => r.name);
  }

  // ========================================================================
  // File Index
  // ========================================================================

  /**
   * Get indexed file count for a vault
   */
  getIndexedFileCount(vault: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM file_index WHERE vault = ?')
      .get(vault) as { count: number };
    return row.count;
  }

  /**
   * Get last indexed timestamp for a vault
   */
  getLastIndexedAt(vault: string): string | undefined {
    const row = this.db
      .prepare('SELECT MAX(indexed_at) as last FROM file_index WHERE vault = ?')
      .get(vault) as { last: string | null };
    return row.last || undefined;
  }

  // ========================================================================
  // Concepts
  // ========================================================================

  /**
   * Upsert a concept (insert or update)
   */
  upsertConcept(conceptId: string, term: string, normalized: string, frequency: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO concepts (concept_id, term, normalized, frequency)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(concept_id) DO UPDATE SET
        term = excluded.term,
        frequency = excluded.frequency
    `);
    stmt.run(conceptId, term, normalized, frequency);
  }

  /**
   * Link a concept to a note with a score
   */
  linkConceptToNote(conceptId: string, vault: string, path: string, score: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO concept_notes (concept_id, vault, path, score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(concept_id, vault, path) DO UPDATE SET
        score = excluded.score
    `);
    stmt.run(conceptId, vault, path, score);
  }

  /**
   * Clear all concept-note links for a vault (useful before re-indexing)
   */
  clearConceptNotesForVault(vault: string): void {
    const stmt = this.db.prepare('DELETE FROM concept_notes WHERE vault = ?');
    stmt.run(vault);
  }

  /**
   * Get concepts for a specific note
   */
  getConceptsForNote(vault: string, path: string): Array<{
    conceptId: string;
    term: string;
    normalized: string;
    score: number;
  }> {
    const rows = this.db.prepare(`
      SELECT c.concept_id as conceptId, c.term, c.normalized, cn.score
      FROM concept_notes cn
      JOIN concepts c ON c.concept_id = cn.concept_id
      WHERE cn.vault = ? AND cn.path = ?
      ORDER BY cn.score DESC
    `).all(vault, path) as Array<{
      conceptId: string;
      term: string;
      normalized: string;
      score: number;
    }>;
    return rows;
  }

  /**
   * Get notes for a specific concept
   */
  getNotesForConcept(conceptId: string, vault?: string): Array<{
    vault: string;
    path: string;
    score: number;
  }> {
    let query = `
      SELECT vault, path, score
      FROM concept_notes
      WHERE concept_id = ?
    `;
    const params: any[] = [conceptId];

    if (vault) {
      query += ' AND vault = ?';
      params.push(vault);
    }

    query += ' ORDER BY score DESC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      vault: string;
      path: string;
      score: number;
    }>;
    return rows;
  }

  // ========================================================================
  // Database Health
  // ========================================================================

  /**
   * Get database file size
   */
  getDatabaseSize(): number {
    const row = this.db
      .prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()')
      .get() as { size: number };
    return row.size;
  }

  /**
   * Run integrity check
   */
  checkIntegrity(): { ok: boolean; issues: string[] } {
    const result = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const ok = result.length === 1 && result[0].integrity_check === 'ok';
    const issues = ok ? [] : result.map(r => r.integrity_check);
    return { ok, issues };
  }
}

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Helper to create database instance
 */
export function createDatabase(dbPath: string): KnowledgeDatabase {
  return new KnowledgeDatabase(dbPath);
}
