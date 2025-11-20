/**
 * execute-dataview-query tool implementation (MVP subset)
 *
 * Implements a simplified subset of Dataview Query Language (DQL):
 * - TABLE queries with basic fields
 * - FROM tag/folder filters
 * - WHERE simple field comparisons
 * - SORT by field name
 * - LIMIT clause
 *
 * Not implemented (future work):
 * - Complex expressions
 * - Aggregations (GROUP BY)
 * - TASK/LIST queries (returns TABLE format for now)
 * - Dataview functions (date(), contains(), etc.)
 */

import { ServerContext } from '../server.js';
import { NoteRef, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface DataviewRow {
  file: NoteRef & { title: string };
  fields: Record<string, any>;
}

export interface ExecuteDataviewQueryInput {
  vault: string;
  query: string;
  format?: 'table' | 'list' | 'task' | 'raw';
}

export interface ExecuteDataviewQueryOutput {
  resultType: 'table' | 'list' | 'task' | 'raw';
  columns?: string[];
  rows?: DataviewRow[];
  raw?: any;
  queryParsed: {
    type: string;
    fields: string[];
    from?: string;
    where?: string;
    sort?: string;
    limit?: number;
  };
}

/**
 * Simple DQL query parser
 */
interface ParsedQuery {
  type: 'TABLE' | 'LIST' | 'TASK';
  fields: string[];
  from?: string;
  where?: string;
  sort?: { field: string; direction: 'ASC' | 'DESC' };
  limit?: number;
}

/**
 * Parse a simple DQL query
 */
function parseDQL(query: string): ParsedQuery {
  const lines = query.trim().split('\n').map(l => l.trim()).filter(Boolean);

  let type: 'TABLE' | 'LIST' | 'TASK' = 'TABLE';
  let fields: string[] = [];
  let from: string | undefined;
  let where: string | undefined;
  let sort: { field: string; direction: 'ASC' | 'DESC' } | undefined;
  let limit: number | undefined;

  for (const line of lines) {
    const upperLine = line.toUpperCase();

    // TABLE query
    if (upperLine.startsWith('TABLE ')) {
      type = 'TABLE';
      const fieldsStr = line.substring(6).trim();
      fields = fieldsStr.split(',').map(f => f.trim()).filter(Boolean);
    }
    // LIST query
    else if (upperLine.startsWith('LIST ')) {
      type = 'LIST';
      const fieldsStr = line.substring(5).trim();
      fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : ['file.name'];
    }
    // TASK query
    else if (upperLine.startsWith('TASK')) {
      type = 'TASK';
      fields = ['file.name']; // Tasks return file name
    }
    // FROM clause
    else if (upperLine.startsWith('FROM ')) {
      from = line.substring(5).trim();
    }
    // WHERE clause
    else if (upperLine.startsWith('WHERE ')) {
      where = line.substring(6).trim();
    }
    // SORT clause
    else if (upperLine.startsWith('SORT ')) {
      const sortStr = line.substring(5).trim();
      const parts = sortStr.split(/\s+/);
      const field = parts[0];
      const direction = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      sort = { field, direction };
    }
    // LIMIT clause
    else if (upperLine.startsWith('LIMIT ')) {
      const limitStr = line.substring(6).trim();
      limit = parseInt(limitStr, 10);
    }
  }

  // Default fields for TABLE if none specified
  if (type === 'TABLE' && fields.length === 0) {
    fields = ['file.name'];
  }

  return { type, fields, from, where, sort, limit };
}

/**
 * Execute dataview query
 */
export async function handleExecuteDataviewQuery(
  context: ServerContext,
  args: ExecuteDataviewQueryInput
): Promise<ToolResponse<ExecuteDataviewQueryOutput>> {
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

    if (!args.query) {
      return {
        status: 'error',
        error: {
          code: 'MISSING_QUERY',
          message: 'query parameter is required'
        }
      };
    }

    // Validate vault
    const vault = validateVault(context.config, args.vault);
    const fileOps = new FileOperations(vault.path);

    // Parse query
    const parsed = parseDQL(args.query);

    // Get all markdown files
    const allFiles = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: false
    });

    // Build rows
    const rows: DataviewRow[] = [];

    for (const file of allFiles) {
      try {
        // Read and parse frontmatter
        const content = await fileOps.readFile(file.path);
        const { frontmatter, body } = parseFrontmatter(content);

        // Extract title (from frontmatter or filename)
        const title = frontmatter?.title || file.name.replace(/\.md$/, '');

        // Apply FROM filter
        if (parsed.from) {
          if (!matchesFrom(file.path, frontmatter, parsed.from)) {
            continue;
          }
        }

        // Build field values
        const fields: Record<string, any> = {};

        for (const fieldSpec of parsed.fields) {
          const value = extractField(fieldSpec, file.path, title, frontmatter, body);
          fields[fieldSpec] = value;
        }

        // Apply WHERE filter
        if (parsed.where) {
          if (!matchesWhere(frontmatter, parsed.where)) {
            continue;
          }
        }

        rows.push({
          file: {
            vault: args.vault,
            path: file.path,
            title
          },
          fields
        });
      } catch (error) {
        // Skip files that fail to parse
        continue;
      }
    }

    // Apply SORT
    if (parsed.sort) {
      rows.sort((a, b) => {
        const aVal = a.fields[parsed.sort!.field];
        const bVal = b.fields[parsed.sort!.field];

        let cmp = 0;
        if (aVal < bVal) cmp = -1;
        else if (aVal > bVal) cmp = 1;

        return parsed.sort!.direction === 'DESC' ? -cmp : cmp;
      });
    }

    // Apply LIMIT
    let finalRows = rows;
    if (parsed.limit && parsed.limit > 0) {
      finalRows = rows.slice(0, parsed.limit);
    }

    // Extract columns from fields
    const columns = parsed.fields;

    return {
      status: 'ok',
      data: {
        resultType: 'table',
        columns,
        rows: finalRows,
        queryParsed: {
          type: parsed.type,
          fields: parsed.fields,
          from: parsed.from,
          where: parsed.where,
          sort: parsed.sort ? `${parsed.sort.field} ${parsed.sort.direction}` : undefined,
          limit: parsed.limit
        }
      },
      meta: {
        tool: 'execute-dataview-query',
        vault: args.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'DATAVIEW_QUERY_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}

/**
 * Check if a note matches the FROM clause
 */
function matchesFrom(path: string, frontmatter: Record<string, any> | null, fromClause: string): boolean {
  const trimmed = fromClause.trim();

  // FROM #tag
  if (trimmed.startsWith('#')) {
    const tag = trimmed.substring(1);
    const tags = frontmatter?.tags || [];
    const tagArray = Array.isArray(tags) ? tags : [tags];
    return tagArray.some((t: string) => t === tag || t.startsWith(tag + '/'));
  }

  // FROM "folder"
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const folder = trimmed.substring(1, trimmed.length - 1);
    return path.startsWith(folder + '/') || path.startsWith(folder);
  }

  // FROM folder (unquoted)
  return path.startsWith(trimmed + '/') || path.startsWith(trimmed);
}

/**
 * Check if a note matches the WHERE clause (simplified)
 */
function matchesWhere(frontmatter: Record<string, any> | null, whereClause: string): boolean {
  if (!frontmatter) return false;

  // Very simple WHERE parser (field = "value" or field = value)
  // Supports: field = "value", field != "value", field > number, field < number

  const eqMatch = whereClause.match(/(\w+)\s*=\s*"([^"]+)"/);
  if (eqMatch) {
    const [, field, value] = eqMatch;
    return frontmatter[field] === value;
  }

  const neqMatch = whereClause.match(/(\w+)\s*!=\s*"([^"]+)"/);
  if (neqMatch) {
    const [, field, value] = neqMatch;
    return frontmatter[field] !== value;
  }

  const gtMatch = whereClause.match(/(\w+)\s*>\s*(\d+)/);
  if (gtMatch) {
    const [, field, value] = gtMatch;
    return (frontmatter[field] || 0) > parseInt(value, 10);
  }

  const ltMatch = whereClause.match(/(\w+)\s*<\s*(\d+)/);
  if (ltMatch) {
    const [, field, value] = ltMatch;
    return (frontmatter[field] || 0) < parseInt(value, 10);
  }

  // Default: no match
  return true;
}

/**
 * Extract field value from note
 */
function extractField(
  fieldSpec: string,
  path: string,
  title: string,
  frontmatter: Record<string, any> | null,
  _body: string // Reserved for future use (body content search)
): any {
  const spec = fieldSpec.trim();

  // file.name
  if (spec === 'file.name' || spec === 'file') {
    return title;
  }

  // file.path
  if (spec === 'file.path') {
    return path;
  }

  // file.folder
  if (spec === 'file.folder') {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
  }

  // file.size (not available in this context)
  if (spec === 'file.size') {
    return null;
  }

  // Frontmatter field
  if (frontmatter && spec in frontmatter) {
    return frontmatter[spec];
  }

  // Default: null
  return null;
}
