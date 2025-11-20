/**
 * GROUP BY and aggregation support for Dataview queries
 *
 * Supports:
 * - GROUP BY single or multiple fields
 * - Aggregate functions: COUNT, SUM, AVG, MIN, MAX, FIRST, LAST
 * - Nested field grouping
 */

import { ExpressionValue } from './expression-evaluator.js';

export interface AggregateFunction {
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'FIRST' | 'LAST' | 'LIST';
  field?: string; // Optional for COUNT
  alias?: string; // AS alias
}

export interface GroupBySpec {
  fields: string[];
  aggregates: AggregateFunction[];
}

export interface GroupedRow {
  groupKey: Record<string, ExpressionValue>;
  rows: any[];
  aggregates: Record<string, ExpressionValue>;
}

export class AggregationEngine {
  constructor() {
    // Intentionally empty - aggregation doesn't need expression evaluation
  }

  /**
   * Execute GROUP BY query
   */
  groupBy(
    rows: any[],
    spec: GroupBySpec
  ): GroupedRow[] {
    // Group rows by specified fields
    const groups = new Map<string, any[]>();

    for (const row of rows) {
      const groupKey = this.extractGroupKey(row, spec.fields);
      const keyStr = JSON.stringify(groupKey);

      if (!groups.has(keyStr)) {
        groups.set(keyStr, []);
      }
      groups.get(keyStr)!.push(row);
    }

    // Compute aggregates for each group
    const results: GroupedRow[] = [];

    for (const [keyStr, groupRows] of groups) {
      const groupKey = JSON.parse(keyStr);
      const aggregates: Record<string, ExpressionValue> = {};

      for (const agg of spec.aggregates) {
        const alias = agg.alias || this.getDefaultAlias(agg);
        aggregates[alias] = this.computeAggregate(agg, groupRows);
      }

      results.push({
        groupKey,
        rows: groupRows,
        aggregates
      });
    }

    return results;
  }

  /**
   * Extract group key from row
   */
  private extractGroupKey(row: any, fields: string[]): Record<string, ExpressionValue> {
    const key: Record<string, ExpressionValue> = {};

    for (const field of fields) {
      key[field] = this.extractFieldValue(row, field);
    }

    return key;
  }

  /**
   * Extract field value (supports nested paths like "file.folder")
   */
  private extractFieldValue(row: any, fieldPath: string): ExpressionValue {
    const parts = fieldPath.split('.');
    let value: any = row;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }

      // Check in fields first
      if (value.fields && part in value.fields) {
        value = value.fields[part];
      }
      // Then check in file
      else if (value.file && part in value.file) {
        value = value.file[part];
      }
      // Direct property access
      else if (part in value) {
        value = value[part];
      }
      else {
        return null;
      }
    }

    return value;
  }

  /**
   * Compute aggregate function over group
   */
  private computeAggregate(agg: AggregateFunction, rows: any[]): ExpressionValue {
    switch (agg.type) {
      case 'COUNT':
        return rows.length;

      case 'SUM': {
        if (!agg.field) return null;
        const values = rows.map(r => this.extractFieldValue(r, agg.field!)).filter(v => typeof v === 'number');
        return values.reduce((a, b) => (a as number) + (b as number), 0);
      }

      case 'AVG': {
        if (!agg.field) return null;
        const values = rows.map(r => this.extractFieldValue(r, agg.field!)).filter(v => typeof v === 'number');
        if (values.length === 0) return null;
        const sum = values.reduce((a, b) => (a as number) + (b as number), 0) as number;
        return sum / values.length;
      }

      case 'MIN': {
        if (!agg.field) return null;
        const values = rows.map(r => this.extractFieldValue(r, agg.field!)).filter(v => v !== null && v !== undefined);
        if (values.length === 0) return null;
        return values.reduce((a, b) => {
          if (a === null) return b;
          if (b === null) return a;
          return this.compare(a, b) < 0 ? a : b;
        });
      }

      case 'MAX': {
        if (!agg.field) return null;
        const values = rows.map(r => this.extractFieldValue(r, agg.field!)).filter(v => v !== null && v !== undefined);
        if (values.length === 0) return null;
        return values.reduce((a, b) => {
          if (a === null) return b;
          if (b === null) return a;
          return this.compare(a, b) > 0 ? a : b;
        });
      }

      case 'FIRST': {
        if (rows.length === 0) return null;
        if (!agg.field) return rows[0];
        return this.extractFieldValue(rows[0], agg.field);
      }

      case 'LAST': {
        if (rows.length === 0) return null;
        if (!agg.field) return rows[rows.length - 1];
        return this.extractFieldValue(rows[rows.length - 1], agg.field);
      }

      case 'LIST': {
        if (!agg.field) return rows.map(r => r.file?.name || r.file?.path);
        return rows.map(r => this.extractFieldValue(r, agg.field!)).filter(v => v !== null && v !== undefined);
      }

      default:
        throw new Error(`Unknown aggregate function: ${agg.type}`);
    }
  }

  /**
   * Compare two values
   */
  private compare(a: ExpressionValue, b: ExpressionValue): number {
    // Date comparison
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (a instanceof Date || b instanceof Date) {
      const aTime = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
      const bTime = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
      return aTime - bTime;
    }

    // Numeric comparison
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    // String comparison
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }

    // Default
    return 0;
  }

  /**
   * Get default alias for aggregate function
   */
  private getDefaultAlias(agg: AggregateFunction): string {
    if (agg.type === 'COUNT') {
      return agg.field ? `count_${agg.field}` : 'count';
    }
    return `${agg.type.toLowerCase()}_${agg.field || 'value'}`;
  }
}

/**
 * Parse aggregate function from field expression
 * Examples:
 *   "COUNT()" -> { type: 'COUNT' }
 *   "SUM(value)" -> { type: 'SUM', field: 'value' }
 *   "AVG(rating) AS average_rating" -> { type: 'AVG', field: 'rating', alias: 'average_rating' }
 */
export function parseAggregateFunction(expr: string): AggregateFunction | null {
  const aggPattern = /^(COUNT|SUM|AVG|MIN|MAX|FIRST|LAST|LIST)\s*\(\s*([^)]*)\s*\)(?:\s+AS\s+(\w+))?$/i;
  const match = expr.trim().match(aggPattern);

  if (!match) return null;

  const type = match[1].toUpperCase() as AggregateFunction['type'];
  const field = match[2].trim() || undefined;
  const alias = match[3] || undefined;

  return { type, field, alias };
}

/**
 * Check if field expression is an aggregate function
 */
export function isAggregateFunction(expr: string): boolean {
  return parseAggregateFunction(expr) !== null;
}
