/**
 * Enhanced DQL query parser
 *
 * Supports:
 * - FLATTEN field (explode array fields into multiple rows)
 * - Complex FROM clauses with OR/AND logic
 * - Multiple tag/folder sources
 */

export interface ParsedQuery {
  type: 'TABLE' | 'LIST' | 'TASK';
  fields: string[];
  from?: FromClause;
  where?: string;
  sort?: SortClause;
  groupBy?: string[];
  flatten?: string;
  limit?: number;
}

export interface FromClause {
  type: 'simple' | 'complex';
  // Simple: single tag/folder
  source?: string; // "#tag" or "folder"
  // Complex: multiple sources with OR/AND
  sources?: FromSource[];
  operator?: 'OR' | 'AND';
}

export interface FromSource {
  type: 'tag' | 'folder' | 'file';
  value: string;
  negated?: boolean; // Support "-#tag" (exclude)
}

export interface SortClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Tokenize a single-line query by DQL keywords
 * Returns an object with clause positions
 */
interface QueryTokens {
  fields: string;
  from?: string;
  where?: string;
  sort?: string;
  groupBy?: string;
  flatten?: string;
  limit?: string;
}

function tokenizeSingleLineQuery(queryStr: string): QueryTokens {
  const tokens: QueryTokens = { fields: '' };

  // Keywords we need to find (in order of typical appearance)
  const keywords = ['FROM', 'WHERE', 'SORT', 'GROUP BY', 'FLATTEN', 'LIMIT'];

  // Find positions of all keywords
  interface KeywordPosition {
    keyword: string;
    index: number;
  }

  const positions: KeywordPosition[] = [];
  const upperQuery = queryStr.toUpperCase();

  for (const keyword of keywords) {
    // Use regex to find whole-word matches (with space before and after)
    const pattern = new RegExp(`\\s${keyword}\\s`, 'g');
    let match;
    while ((match = pattern.exec(upperQuery)) !== null) {
      // Position is at the start of the keyword (after the space)
      positions.push({ keyword, index: match.index + 1 });
    }
  }

  // Sort by position
  positions.sort((a, b) => a.index - b.index);

  // Extract clauses between keyword positions
  for (let i = 0; i < positions.length; i++) {
    const { keyword, index } = positions[i];
    const nextIndex = positions[i + 1]?.index ?? queryStr.length;

    // Extract the clause content (skip the keyword itself)
    const keywordEnd = index + keyword.length;
    const clauseContent = queryStr.substring(keywordEnd, nextIndex).trim();

    // Store in appropriate field
    if (keyword === 'FROM') {
      tokens.from = clauseContent;
    } else if (keyword === 'WHERE') {
      tokens.where = clauseContent;
    } else if (keyword === 'SORT') {
      tokens.sort = clauseContent;
    } else if (keyword === 'GROUP BY') {
      tokens.groupBy = clauseContent;
    } else if (keyword === 'FLATTEN') {
      tokens.flatten = clauseContent;
    } else if (keyword === 'LIMIT') {
      tokens.limit = clauseContent;
    }
  }

  // Extract fields (everything before first keyword, or entire string if no keywords)
  if (positions.length > 0) {
    tokens.fields = queryStr.substring(0, positions[0].index).trim();
  } else {
    tokens.fields = queryStr.trim();
  }

  return tokens;
}

/**
 * Parse DQL query with advanced features
 */
export function parseDataviewQuery(query: string): ParsedQuery {
  const lines = query.trim().split('\n').map(l => l.trim()).filter(Boolean);

  let type: 'TABLE' | 'LIST' | 'TASK' = 'TABLE';
  let fields: string[] = [];
  let from: FromClause | undefined;
  let where: string | undefined;
  let sort: SortClause | undefined;
  let groupBy: string[] | undefined;
  let flatten: string | undefined;
  let limit: number | undefined;

  // Track if we're processing a single-line query
  let processedSingleLine = false;

  for (const line of lines) {
    const upperLine = line.toUpperCase();

    // TABLE query (may include FROM/WHERE/SORT/LIMIT on same line)
    if (upperLine.startsWith('TABLE ')) {
      type = 'TABLE';
      const remainder = line.substring(6).trim();

      // Tokenize the remainder to extract all clauses
      const tokens = tokenizeSingleLineQuery(remainder);

      // Parse fields
      fields = tokens.fields ? parseFieldList(tokens.fields) : [];

      // Parse FROM if present
      if (tokens.from) {
        from = parseFromClause(tokens.from);
      }

      // Parse WHERE if present
      if (tokens.where) {
        where = tokens.where;
      }

      // Parse SORT if present
      if (tokens.sort) {
        sort = parseSortClause(tokens.sort);
      }

      // Parse GROUP BY if present
      if (tokens.groupBy) {
        groupBy = tokens.groupBy.split(',').map(f => f.trim()).filter(Boolean);
      }

      // Parse FLATTEN if present
      if (tokens.flatten) {
        flatten = tokens.flatten;
      }

      // Parse LIMIT if present
      if (tokens.limit) {
        limit = parseInt(tokens.limit, 10);
      }

      processedSingleLine = true;
    }
    // LIST query (may include FROM/WHERE/SORT/LIMIT on same line)
    else if (upperLine.startsWith('LIST ')) {
      type = 'LIST';
      const remainder = line.substring(5).trim();

      // Tokenize the remainder to extract all clauses
      const tokens = tokenizeSingleLineQuery(remainder);

      // Parse fields (default to file.name if empty)
      fields = tokens.fields ? parseFieldList(tokens.fields) : ['file.name'];

      // Parse FROM if present
      if (tokens.from) {
        from = parseFromClause(tokens.from);
      }

      // Parse WHERE if present
      if (tokens.where) {
        where = tokens.where;
      }

      // Parse SORT if present
      if (tokens.sort) {
        sort = parseSortClause(tokens.sort);
      }

      // Parse GROUP BY if present
      if (tokens.groupBy) {
        groupBy = tokens.groupBy.split(',').map(f => f.trim()).filter(Boolean);
      }

      // Parse FLATTEN if present
      if (tokens.flatten) {
        flatten = tokens.flatten;
      }

      // Parse LIMIT if present
      if (tokens.limit) {
        limit = parseInt(tokens.limit, 10);
      }

      processedSingleLine = true;
    }
    // TASK query
    else if (upperLine.startsWith('TASK')) {
      type = 'TASK';
      fields = ['file.name'];

      // Check if there's a remainder with clauses
      const remainder = line.substring(4).trim();
      if (remainder) {
        const tokens = tokenizeSingleLineQuery(remainder);

        // Parse FROM if present
        if (tokens.from) {
          from = parseFromClause(tokens.from);
        }

        // Parse WHERE if present
        if (tokens.where) {
          where = tokens.where;
        }

        // Parse LIMIT if present
        if (tokens.limit) {
          limit = parseInt(tokens.limit, 10);
        }
      }

      processedSingleLine = true;
    }
    // FROM clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('FROM ') && !processedSingleLine) {
      from = parseFromClause(line.substring(5).trim());
    }
    // WHERE clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('WHERE ') && !processedSingleLine) {
      where = line.substring(6).trim();
    }
    // SORT clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('SORT ') && !processedSingleLine) {
      sort = parseSortClause(line.substring(5).trim());
    }
    // GROUP BY clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('GROUP BY ') && !processedSingleLine) {
      const groupFields = line.substring(9).trim();
      groupBy = groupFields.split(',').map(f => f.trim()).filter(Boolean);
    }
    // FLATTEN clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('FLATTEN ') && !processedSingleLine) {
      flatten = line.substring(8).trim();
    }
    // LIMIT clause (standalone line) - only process if not single-line query
    else if (upperLine.startsWith('LIMIT ') && !processedSingleLine) {
      const limitStr = line.substring(6).trim();
      limit = parseInt(limitStr, 10);
    }
  }

  // Default fields for TABLE if none specified
  if (type === 'TABLE' && fields.length === 0) {
    fields = ['file.name'];
  }

  return { type, fields, from, where, sort, groupBy, flatten, limit };
}

/**
 * Parse field specification with optional alias
 * Examples:
 *   "status" -> { expression: "status", alias: null }
 *   "status AS \"Current Status\"" -> { expression: "status", alias: "Current Status" }
 *   "length(file.outlinks) AS \"Links\"" -> { expression: "length(file.outlinks)", alias: "Links" }
 */
export interface FieldSpec {
  expression: string;
  alias: string | null;
}

export function parseFieldSpec(fieldStr: string): FieldSpec {
  const trimmed = fieldStr.trim();

  // Check for AS clause (case-insensitive)
  const asMatch = trimmed.match(/^(.+?)\s+AS\s+(.+)$/i);

  if (asMatch) {
    let expression = asMatch[1].trim();
    let alias = asMatch[2].trim();

    // Remove quotes from alias if present
    if ((alias.startsWith('"') && alias.endsWith('"')) ||
        (alias.startsWith("'") && alias.endsWith("'"))) {
      alias = alias.substring(1, alias.length - 1);
    }

    return { expression, alias };
  }

  // No alias
  return { expression: trimmed, alias: null };
}

/**
 * Parse field list (supports "field1, field2, field3")
 */
function parseFieldList(fieldsStr: string): string[] {
  return fieldsStr.split(',').map(f => f.trim()).filter(Boolean);
}

/**
 * Parse FROM clause with OR/AND support
 * Examples:
 *   FROM #tag
 *   FROM "folder"
 *   FROM #tag1 OR #tag2
 *   FROM #tag AND "folder"
 *   FROM #tag1 OR #tag2 OR "folder"
 *   FROM -#excluded
 */
function parseFromClause(fromStr: string): FromClause {
  // Check for OR operator
  if (fromStr.toUpperCase().includes(' OR ')) {
    const parts = fromStr.split(/\s+OR\s+/i).map(p => p.trim());
    const sources = parts.map(parseFromSource);
    return { type: 'complex', sources, operator: 'OR' };
  }

  // Check for AND operator
  if (fromStr.toUpperCase().includes(' AND ')) {
    const parts = fromStr.split(/\s+AND\s+/i).map(p => p.trim());
    const sources = parts.map(parseFromSource);
    return { type: 'complex', sources, operator: 'AND' };
  }

  // Simple single source
  return { type: 'simple', source: fromStr };
}

/**
 * Parse single FROM source
 */
function parseFromSource(sourceStr: string): FromSource {
  const trimmed = sourceStr.trim();
  let negated = false;

  // Check for negation
  let value = trimmed;
  if (trimmed.startsWith('-')) {
    negated = true;
    value = trimmed.substring(1).trim();
  }

  // Tag
  if (value.startsWith('#')) {
    return {
      type: 'tag',
      value: value.substring(1),
      negated
    };
  }

  // Quoted folder
  if (value.startsWith('"') && value.endsWith('"')) {
    return {
      type: 'folder',
      value: value.substring(1, value.length - 1),
      negated
    };
  }

  // Unquoted folder or file
  return {
    type: 'folder',
    value,
    negated
  };
}

/**
 * Parse SORT clause
 */
function parseSortClause(sortStr: string): SortClause {
  const parts = sortStr.split(/\s+/);
  const field = parts[0];
  const direction = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return { field, direction };
}

/**
 * Check if note matches FROM clause
 */
export function matchesFromClause(
  path: string,
  frontmatter: Record<string, any> | null,
  from: FromClause
): boolean {
  if (from.type === 'simple') {
    return matchesFromSource(path, frontmatter, parseFromSource(from.source!));
  }

  // Complex with OR/AND
  const results = from.sources!.map(source => matchesFromSource(path, frontmatter, source));

  if (from.operator === 'OR') {
    return results.some(r => r);
  } else {
    return results.every(r => r);
  }
}

/**
 * Check if note matches single FROM source
 */
function matchesFromSource(
  path: string,
  frontmatter: Record<string, any> | null,
  source: FromSource
): boolean {
  let matches = false;

  if (source.type === 'tag') {
    const tags = frontmatter?.tags || [];
    const tagArray = Array.isArray(tags) ? tags : [tags];
    matches = tagArray.some((t: string) => t === source.value || t.startsWith(source.value + '/'));
  } else if (source.type === 'folder') {
    matches = path.startsWith(source.value + '/') || path.startsWith(source.value);
  } else if (source.type === 'file') {
    matches = path === source.value || path.endsWith('/' + source.value);
  }

  // Apply negation
  return source.negated ? !matches : matches;
}

/**
 * Apply FLATTEN to rows
 * If a field contains an array, create multiple rows (one per array element)
 */
export function applyFlatten(rows: any[], flattenField: string): any[] {
  const flattened: any[] = [];

  for (const row of rows) {
    const value = extractFieldForFlatten(row, flattenField);

    if (Array.isArray(value) && value.length > 0) {
      // Create one row per array element
      for (const item of value) {
        const newRow = { ...row };
        setFieldValue(newRow, flattenField, item);
        flattened.push(newRow);
      }
    } else {
      // Keep row as-is if field is not an array
      flattened.push(row);
    }
  }

  return flattened;
}

/**
 * Extract field value for FLATTEN
 */
function extractFieldForFlatten(row: any, fieldPath: string): any {
  const parts = fieldPath.split('.');
  let value: any = row;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return null;
    }

    // Check in fields first
    if (value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) && part in value.fields) {
      value = value.fields[part];
    }
    // Then check in file
    else if (value.file && typeof value.file === 'object' && !Array.isArray(value.file) && part in value.file) {
      value = value.file[part];
    }
    // Direct property access
    else if (typeof value === 'object' && !Array.isArray(value) && part in value) {
      value = value[part];
    }
    else {
      return null;
    }
  }

  return value;
}

/**
 * Set field value in row (for FLATTEN)
 */
function setFieldValue(row: any, fieldPath: string, value: any): void {
  const parts = fieldPath.split('.');

  // Simple case: single part
  if (parts.length === 1) {
    if (row.fields) {
      row.fields[parts[0]] = value;
    } else {
      row[parts[0]] = value;
    }
    return;
  }

  // Nested: navigate to parent and set
  let parent: any = row;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (parent.fields && typeof parent.fields === 'object' && !Array.isArray(parent.fields) && part in parent.fields) {
      parent = parent.fields[part];
    } else if (typeof parent === 'object' && !Array.isArray(parent) && part in parent) {
      parent = parent[part];
    } else {
      return; // Cannot set nested field
    }
  }

  const lastPart = parts[parts.length - 1];
  parent[lastPart] = value;
}
