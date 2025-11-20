/**
 * execute-dataview-query tool implementation (Enhanced)
 *
 * Implements comprehensive Dataview Query Language (DQL):
 * - TABLE/LIST/TASK queries
 * - Complex FROM clauses with OR/AND logic
 * - WHERE with full expression support (comparisons, logical operators, functions)
 * - 30+ Dataview functions (date, contains, length, split, etc.)
 * - GROUP BY with aggregations (COUNT, SUM, AVG, MIN, MAX, FIRST, LAST, LIST)
 * - FLATTEN for array expansion
 * - SORT with ASC/DESC
 * - LIMIT clause
 */

import { ServerContext } from '../server.js';
import { NoteRef, ToolResponse } from '../types/core.js';
import { validateVault } from '../config/index.js';
import { FileOperations } from '../vault/file-operations.js';
import { parseFrontmatter } from '../vault/frontmatter.js';
import { ExpressionEvaluator, EvaluationContext } from '../dataview/expression-evaluator.js';
import { AggregationEngine, parseAggregateFunction, isAggregateFunction } from '../dataview/aggregation.js';
import { parseDataviewQuery, matchesFromClause, applyFlatten, parseFieldSpec } from '../dataview/query-parser.js';
import { extractWikilinks } from '../search/regex-helpers.js';

export interface DataviewRow {
  file: NoteRef & {
    title: string;
    ctime?: string | null;
    mtime?: string | null;
    size?: number | null;
    outlinks?: string[];
  };
  fields: Record<string, any>;
}

export interface TaskItem {
  file: NoteRef & {
    title: string;
  };
  line: number;
  text: string;
  completed: boolean;
  tags?: string[];
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
  tasks?: TaskItem[];
  raw?: any;
  queryParsed: {
    type: string;
    fields: string[];
    from?: string;
    where?: string;
    sort?: string;
    groupBy?: string[];
    flatten?: string;
    limit?: number;
  };
}

/**
 * Execute dataview query with full DQL support
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

    // Parse query with enhanced parser
    const parsed = parseDataviewQuery(args.query);

    // Get all markdown files
    const allFiles = await fileOps.listFiles('', {
      recursive: true,
      notesOnly: true,
      includeMetadata: true
    });

    // Build initial rows
    let rows: DataviewRow[] = [];

    for (const file of allFiles) {
      try {
        // Read and parse frontmatter
        const content = await fileOps.readFile(file.path);
        const { frontmatter } = parseFrontmatter(content);

        // Extract title (from frontmatter or filename)
        const title = frontmatter?.title || file.name.replace(/\.md$/, '');

        // Apply FROM filter
        if (parsed.from) {
          if (!matchesFromClause(file.path, frontmatter, parsed.from)) {
            continue;
          }
        }

        // Get file stats for metadata
        let fileStats: { created: string; modified: string; sizeBytes: number } | null = null;
        try {
          fileStats = await fileOps.getFileStats(file.path);
        } catch {
          // File stats unavailable, continue with null values
        }

        // Extract wikilinks (for file.outlinks support)
        const wikilinks = extractWikilinks(content);
        const outlinks = wikilinks.map(link => link.target);

        // Build row object
        const row: DataviewRow = {
          file: {
            vault: args.vault,
            path: file.path,
            title,
            ctime: fileStats?.created || null,
            mtime: fileStats?.modified || null,
            size: fileStats?.sizeBytes || null,
            outlinks
          },
          fields: frontmatter || {}
        };

        rows.push(row);
      } catch (error) {
        // Skip files that fail to parse
        continue;
      }
    }

    // Apply WHERE filter with expression evaluator
    if (parsed.where) {
      const evaluator = new ExpressionEvaluator();
      rows = rows.filter(row => {
        try {
          const context: EvaluationContext = {
            frontmatter: row.fields,
            file: {
              path: row.file.path,
              name: row.file.title,
              folder: row.file.path.includes('/')
                ? row.file.path.substring(0, row.file.path.lastIndexOf('/'))
                : '',
              ext: 'md',
              ctime: row.file.ctime || null,
              mtime: row.file.mtime || null,
              size: row.file.size || null,
              outlinks: row.file.outlinks || []
            }
          };
          const result = evaluator.evaluate(parsed.where!, context);
          return Boolean(result);
        } catch (error) {
          // Skip rows that fail WHERE evaluation
          return false;
        }
      });
    }

    // Handle TASK queries
    if (parsed.type === 'TASK') {
      return await handleTaskQuery(args, parsed, rows, fileOps);
    }

    // Apply FLATTEN
    if (parsed.flatten) {
      rows = applyFlatten(rows, parsed.flatten) as DataviewRow[];
    }

    // Check if we have GROUP BY
    if (parsed.groupBy && parsed.groupBy.length > 0) {
      return handleGroupByQuery(args, parsed, rows);
    }

    // Parse field specifications with aliases
    const fieldSpecs = parsed.fields.map(f => parseFieldSpec(f));
    const columnNames = fieldSpecs.map(spec => spec.alias || spec.expression);

    // Extract field values for non-aggregated queries
    const evaluator = new ExpressionEvaluator();
    for (const row of rows) {
      const context: EvaluationContext = {
        frontmatter: row.fields,
        file: {
          path: row.file.path,
          name: row.file.title,
          folder: row.file.path.includes('/')
            ? row.file.path.substring(0, row.file.path.lastIndexOf('/'))
            : '',
          ext: 'md',
          ctime: row.file.ctime || null,
          mtime: row.file.mtime || null,
          size: row.file.size || null,
          outlinks: row.file.outlinks || []
        }
      };

      // Extract each field using expression evaluator
      const newFields: Record<string, any> = {};
      for (let i = 0; i < fieldSpecs.length; i++) {
        const spec = fieldSpecs[i];
        const columnName = columnNames[i];
        try {
          const value = extractField(spec.expression, context, evaluator);
          newFields[columnName] = value;
        } catch {
          newFields[columnName] = null;
        }
      }
      row.fields = newFields;
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

    return {
      status: 'ok',
      data: {
        resultType: 'table',
        columns: columnNames,
        rows: finalRows,
        queryParsed: {
          type: parsed.type,
          fields: parsed.fields,
          from: parsed.from ? JSON.stringify(parsed.from) : undefined,
          where: parsed.where,
          sort: parsed.sort ? `${parsed.sort.field} ${parsed.sort.direction}` : undefined,
          groupBy: parsed.groupBy,
          flatten: parsed.flatten,
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
 * Handle TASK queries
 */
async function handleTaskQuery(
  args: ExecuteDataviewQueryInput,
  parsed: ReturnType<typeof parseDataviewQuery>,
  rows: DataviewRow[],
  fileOps: FileOperations
): Promise<ToolResponse<ExecuteDataviewQueryOutput>> {
  let allTasks: TaskItem[] = [];

  // Extract tasks from each file in the filtered rows
  for (const row of rows) {
    try {
      const content = await fileOps.readFile(row.file.path);
      const tasks = extractTasks(content, row.file.vault, row.file.path, row.file.title);
      allTasks.push(...tasks);
    } catch (error) {
      // Skip files that fail to read
      continue;
    }
  }

  // Apply WHERE filter on tasks if specified
  if (parsed.where) {
    const evaluator = new ExpressionEvaluator();
    allTasks = allTasks.filter(task => {
      try {
        // Build context for task evaluation
        const context: EvaluationContext = {
          frontmatter: {
            text: task.text,
            completed: task.completed,
            tags: task.tags || []
          },
          file: {
            path: task.file.path,
            name: task.file.title,
            folder: task.file.path.includes('/')
              ? task.file.path.substring(0, task.file.path.lastIndexOf('/'))
              : '',
            ext: 'md'
          }
        };
        const result = evaluator.evaluate(parsed.where!, context);
        return Boolean(result);
      } catch (error) {
        return false;
      }
    });
  }

  // Apply LIMIT
  let finalTasks = allTasks;
  if (parsed.limit && parsed.limit > 0) {
    finalTasks = allTasks.slice(0, parsed.limit);
  }

  return {
    status: 'ok',
    data: {
      resultType: 'task',
      tasks: finalTasks,
      queryParsed: {
        type: parsed.type,
        fields: parsed.fields,
        from: parsed.from ? JSON.stringify(parsed.from) : undefined,
        where: parsed.where,
        sort: parsed.sort ? `${parsed.sort.field} ${parsed.sort.direction}` : undefined,
        groupBy: parsed.groupBy,
        flatten: parsed.flatten,
        limit: parsed.limit
      }
    },
    meta: {
      tool: 'execute-dataview-query',
      vault: args.vault,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Handle GROUP BY queries with aggregations
 */
function handleGroupByQuery(
  args: ExecuteDataviewQueryInput,
  parsed: ReturnType<typeof parseDataviewQuery>,
  rows: DataviewRow[]
): ToolResponse<ExecuteDataviewQueryOutput> {
  const aggregationEngine = new AggregationEngine();

  // Separate aggregate functions from regular fields
  const aggregates = parsed.fields
    .map(f => parseAggregateFunction(f))
    .filter((agg): agg is NonNullable<typeof agg> => agg !== null);

  const groupByFields = parsed.groupBy || [];

  // Execute GROUP BY
  const grouped = aggregationEngine.groupBy(rows, {
    fields: groupByFields,
    aggregates
  });

  // Convert grouped results to DataviewRow format
  const resultRows: DataviewRow[] = grouped.map(group => {
    const fields: Record<string, any> = {
      ...group.groupKey,
      ...group.aggregates
    };

    // Use first row's file info (or create synthetic)
    const firstRow = group.rows[0];
    return {
      file: firstRow?.file || {
        vault: args.vault,
        path: '',
        title: 'Aggregated'
      },
      fields
    };
  });

  // Determine columns (group fields + aggregates)
  const columns = [
    ...groupByFields,
    ...aggregates.map(agg => agg.alias || `${agg.type.toLowerCase()}_${agg.field || 'value'}`)
  ];

  // Apply SORT
  if (parsed.sort) {
    resultRows.sort((a, b) => {
      const aVal = a.fields[parsed.sort!.field];
      const bVal = b.fields[parsed.sort!.field];

      let cmp = 0;
      if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;

      return parsed.sort!.direction === 'DESC' ? -cmp : cmp;
    });
  }

  // Apply LIMIT
  let finalRows = resultRows;
  if (parsed.limit && parsed.limit > 0) {
    finalRows = resultRows.slice(0, parsed.limit);
  }

  return {
    status: 'ok',
    data: {
      resultType: 'table',
      columns,
      rows: finalRows,
      queryParsed: {
        type: parsed.type,
        fields: parsed.fields,
        from: parsed.from ? JSON.stringify(parsed.from) : undefined,
        where: parsed.where,
        sort: parsed.sort ? `${parsed.sort.field} ${parsed.sort.direction}` : undefined,
        groupBy: parsed.groupBy,
        flatten: parsed.flatten,
        limit: parsed.limit
      }
    },
    meta: {
      tool: 'execute-dataview-query',
      vault: args.vault,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Extract field value from note
 */
function extractField(
  fieldSpec: string,
  context: EvaluationContext,
  evaluator: ExpressionEvaluator
): any {
  const spec = fieldSpec.trim();

  // Check if it's an aggregate function (shouldn't be in non-GROUP BY queries)
  if (isAggregateFunction(spec)) {
    throw new Error('Aggregate functions require GROUP BY clause');
  }

  // Special file fields
  if (spec === 'file.name' || spec === 'file') {
    return context.file.name;
  }
  if (spec === 'file.path') {
    return context.file.path;
  }
  if (spec === 'file.folder') {
    return context.file.folder;
  }
  if (spec === 'file.ctime') {
    return context.file.ctime;
  }
  if (spec === 'file.mtime') {
    return context.file.mtime;
  }
  if (spec === 'file.size') {
    return context.file.size;
  }
  if (spec === 'file.outlinks') {
    return (context.file as any).outlinks || [];
  }

  // Try to evaluate as expression (supports functions, property access, etc.)
  try {
    return evaluator.evaluate(spec, context);
  } catch {
    // Fallback: check frontmatter directly
    if (context.frontmatter && spec in context.frontmatter) {
      return context.frontmatter[spec];
    }
    return null;
  }
}

/**
 * Extract task items from markdown content
 */
function extractTasks(content: string, vault: string, path: string, title: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const lines = content.split('\n');

  // Task pattern: - [ ] or - [x] or - [X]
  const taskPattern = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = taskPattern.exec(line);

    if (match) {
      const completed = match[2].toLowerCase() === 'x';
      const text = match[3].trim();

      // Extract inline tags from task text
      const tagPattern = /#[\w-/]+/g;
      const tags = text.match(tagPattern) || [];

      tasks.push({
        file: {
          vault,
          path,
          title
        },
        line: i + 1, // 1-indexed line number
        text,
        completed,
        tags: tags.length > 0 ? tags : undefined
      });
    }
  }

  return tasks;
}
