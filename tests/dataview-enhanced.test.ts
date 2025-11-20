/**
 * Integration tests for enhanced Dataview functionality
 *
 * Tests all 4 phases:
 * - Phase 1: Expression evaluator
 * - Phase 2: Dataview functions
 * - Phase 3: GROUP BY and aggregations
 * - Phase 4: FLATTEN and complex FROM
 */

import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator, EvaluationContext } from '../src/dataview/expression-evaluator.js';
import { DataviewFunctions } from '../src/dataview/functions.js';
import { AggregationEngine, parseAggregateFunction } from '../src/dataview/aggregation.js';
import { parseDataviewQuery, matchesFromClause, applyFlatten } from '../src/dataview/query-parser.js';

describe('Phase 1: Expression Evaluator', () => {
  const evaluator = new ExpressionEvaluator();

  const testContext: EvaluationContext = {
    frontmatter: {
      rating: 5,
      status: 'active',
      tags: ['important', 'project'],
      created: '2025-01-15'
    },
    file: {
      path: 'Projects/MyProject.md',
      name: 'MyProject',
      folder: 'Projects',
      ext: 'md'
    }
  };

  it('should evaluate simple comparisons', () => {
    expect(evaluator.evaluate('rating > 3', testContext)).toBe(true);
    expect(evaluator.evaluate('rating = 5', testContext)).toBe(true);
    expect(evaluator.evaluate('rating != 10', testContext)).toBe(true);
    expect(evaluator.evaluate('rating <= 5', testContext)).toBe(true);
  });

  it('should evaluate logical operators', () => {
    expect(evaluator.evaluate('rating > 3 AND status = "active"', testContext)).toBe(true);
    expect(evaluator.evaluate('rating < 3 OR status = "active"', testContext)).toBe(true);
    expect(evaluator.evaluate('NOT (rating < 3)', testContext)).toBe(true);
  });

  it('should evaluate property access', () => {
    expect(evaluator.evaluate('file.name', testContext)).toBe('MyProject');
    expect(evaluator.evaluate('file.folder', testContext)).toBe('Projects');
    expect(evaluator.evaluate('tags.length', testContext)).toBe(2);
  });

  it('should evaluate arithmetic expressions', () => {
    expect(evaluator.evaluate('rating + 5', testContext)).toBe(10);
    expect(evaluator.evaluate('rating * 2', testContext)).toBe(10);
    expect(evaluator.evaluate('(rating + 5) * 2', testContext)).toBe(20);
  });

  it('should handle function calls', () => {
    expect(evaluator.evaluate('length(tags)', testContext)).toBe(2);
    expect(evaluator.evaluate('lower(status)', testContext)).toBe('active');
    expect(evaluator.evaluate('contains(tags, "important")', testContext)).toBe(true);
  });

  it('should handle complex expressions', () => {
    expect(evaluator.evaluate(
      'rating > 3 AND contains(tags, "important") AND status = "active"',
      testContext
    )).toBe(true);
  });
});

describe('Phase 2: Dataview Functions', () => {
  const functions = new DataviewFunctions();

  it('should handle date functions', () => {
    const dateResult = functions.call('date', ['2025-01-15']);
    expect(dateResult).toBeInstanceOf(Date);
    expect((dateResult as Date).getFullYear()).toBe(2025);

    const formatted = functions.call('dateformat', [dateResult, 'YYYY-MM-DD']);
    expect(formatted).toBe('2025-01-15');
  });

  it('should handle duration parsing', () => {
    expect(functions.call('dur', ['1d'])).toBe(86400);
    expect(functions.call('dur', ['2h'])).toBe(7200);
    expect(functions.call('dur', ['1d 2h 30m'])).toBe(86400 + 7200 + 1800);
  });

  it('should handle array functions', () => {
    const arr = ['a', 'b', 'c'];

    expect(functions.call('contains', [arr, 'b'])).toBe(true);
    expect(functions.call('contains', [arr, 'd'])).toBe(false);
    expect(functions.call('length', [arr])).toBe(3);
    expect(functions.call('join', [arr, ', '])).toBe('a, b, c');
    expect(functions.call('reverse', [arr])).toEqual(['c', 'b', 'a']);
  });

  it('should handle string functions', () => {
    expect(functions.call('lower', ['HELLO'])).toBe('hello');
    expect(functions.call('upper', ['hello'])).toBe('HELLO');
    expect(functions.call('replace', ['hello world', 'world', 'there'])).toBe('hello there');
    expect(functions.call('split', ['a,b,c', ','])).toEqual(['a', 'b', 'c']);
    expect(functions.call('startswith', ['hello', 'hel'])).toBe(true);
    expect(functions.call('endswith', ['hello', 'lo'])).toBe(true);
  });

  it('should handle regex functions', () => {
    expect(functions.call('regexmatch', ['hello123', '\\d+'])).toBe(true);
    expect(functions.call('regexreplace', ['hello123', '\\d+', 'ABC'])).toBe('helloABC');
  });

  it('should handle utility functions', () => {
    expect(functions.call('default', [null, 'fallback'])).toBe('fallback');
    expect(functions.call('default', ['value', 'fallback'])).toBe('value');
    expect(functions.call('choice', [true, 'yes', 'no'])).toBe('yes');
    expect(functions.call('choice', [false, 'yes', 'no'])).toBe('no');
  });

  it('should handle math functions', () => {
    expect(functions.call('round', [3.14159, 2])).toBe(3.14);
    expect(functions.call('min', [1, 5, 3, 9, 2])).toBe(1);
    expect(functions.call('max', [1, 5, 3, 9, 2])).toBe(9);
    expect(functions.call('sum', [1, 2, 3, 4])).toBe(10);
    expect(functions.call('average', [1, 2, 3, 4])).toBe(2.5);
  });
});

describe('Phase 3: Aggregation Engine', () => {
  const engine = new AggregationEngine();

  const testRows = [
    { file: { path: 'a.md', name: 'A', title: 'A' }, fields: { category: 'X', value: 10 } },
    { file: { path: 'b.md', name: 'B', title: 'B' }, fields: { category: 'X', value: 20 } },
    { file: { path: 'c.md', name: 'C', title: 'C' }, fields: { category: 'Y', value: 15 } },
    { file: { path: 'd.md', name: 'D', title: 'D' }, fields: { category: 'Y', value: 25 } }
  ];

  it('should group by single field', () => {
    const result = engine.groupBy(testRows, {
      fields: ['category'],
      aggregates: [{ type: 'COUNT' }]
    });

    expect(result).toHaveLength(2);
    expect(result.find(r => r.groupKey.category === 'X')?.aggregates.count).toBe(2);
    expect(result.find(r => r.groupKey.category === 'Y')?.aggregates.count).toBe(2);
  });

  it('should compute SUM aggregate', () => {
    const result = engine.groupBy(testRows, {
      fields: ['category'],
      aggregates: [{ type: 'SUM', field: 'value' }]
    });

    expect(result.find(r => r.groupKey.category === 'X')?.aggregates.sum_value).toBe(30);
    expect(result.find(r => r.groupKey.category === 'Y')?.aggregates.sum_value).toBe(40);
  });

  it('should compute AVG aggregate', () => {
    const result = engine.groupBy(testRows, {
      fields: ['category'],
      aggregates: [{ type: 'AVG', field: 'value' }]
    });

    expect(result.find(r => r.groupKey.category === 'X')?.aggregates.avg_value).toBe(15);
    expect(result.find(r => r.groupKey.category === 'Y')?.aggregates.avg_value).toBe(20);
  });

  it('should compute MIN/MAX aggregates', () => {
    const result = engine.groupBy(testRows, {
      fields: ['category'],
      aggregates: [
        { type: 'MIN', field: 'value' },
        { type: 'MAX', field: 'value' }
      ]
    });

    const groupX = result.find(r => r.groupKey.category === 'X')!.aggregates;
    expect(groupX.min_value).toBe(10);
    expect(groupX.max_value).toBe(20);
  });

  it('should handle multiple aggregates with aliases', () => {
    const result = engine.groupBy(testRows, {
      fields: ['category'],
      aggregates: [
        { type: 'COUNT', alias: 'total' },
        { type: 'SUM', field: 'value', alias: 'total_value' },
        { type: 'AVG', field: 'value', alias: 'avg_value' }
      ]
    });

    const groupX = result.find(r => r.groupKey.category === 'X')!.aggregates;
    expect(groupX.total).toBe(2);
    expect(groupX.total_value).toBe(30);
    expect(groupX.avg_value).toBe(15);
  });

  it('should parse aggregate function strings', () => {
    expect(parseAggregateFunction('COUNT()')).toEqual({ type: 'COUNT', field: undefined, alias: undefined });
    expect(parseAggregateFunction('SUM(value)')).toEqual({ type: 'SUM', field: 'value', alias: undefined });
    expect(parseAggregateFunction('AVG(rating) AS average')).toEqual({ type: 'AVG', field: 'rating', alias: 'average' });
  });
});

describe('Phase 4: Query Parser and FLATTEN', () => {
  it('should parse simple queries', () => {
    const query = `
      TABLE file.name, status
      FROM #project
      WHERE rating > 3
      SORT created DESC
      LIMIT 10
    `;

    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.fields).toEqual(['file.name', 'status']);
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.where).toBe('rating > 3');
    expect(parsed.sort).toEqual({ field: 'created', direction: 'DESC' });
    expect(parsed.limit).toBe(10);
  });

  it('should parse GROUP BY queries', () => {
    const query = `
      TABLE category, COUNT() AS total, SUM(value) AS sum
      FROM #data
      GROUP BY category
    `;

    const parsed = parseDataviewQuery(query);

    expect(parsed.groupBy).toEqual(['category']);
    expect(parsed.fields).toContain('COUNT() AS total');
    expect(parsed.fields).toContain('SUM(value) AS sum');
  });

  it('should parse FLATTEN queries', () => {
    const query = `
      TABLE file.name, tags
      FLATTEN tags
    `;

    const parsed = parseDataviewQuery(query);
    expect(parsed.flatten).toBe('tags');
  });

  it('should parse complex FROM with OR', () => {
    const query = `TABLE file.name FROM #tag1 OR #tag2 OR "folder"`;
    const parsed = parseDataviewQuery(query);

    expect(parsed.from?.type).toBe('complex');
    expect(parsed.from?.operator).toBe('OR');
    expect(parsed.from?.sources).toHaveLength(3);
  });

  it('should parse complex FROM with AND', () => {
    const query = `TABLE file.name FROM #tag AND "Projects"`;
    const parsed = parseDataviewQuery(query);

    expect(parsed.from?.type).toBe('complex');
    expect(parsed.from?.operator).toBe('AND');
    expect(parsed.from?.sources).toHaveLength(2);
  });

  it('should match FROM clauses correctly', () => {
    const frontmatter = { tags: ['project', 'important'] };

    const simpleFrom = { type: 'simple' as const, source: '#project' };
    expect(matchesFromClause('path/to/file.md', frontmatter, simpleFrom)).toBe(true);

    const folderFrom = { type: 'simple' as const, source: '"path/to"' };
    expect(matchesFromClause('path/to/file.md', frontmatter, folderFrom)).toBe(true);

    const orFrom = {
      type: 'complex' as const,
      sources: [
        { type: 'tag' as const, value: 'project', negated: false },
        { type: 'tag' as const, value: 'work', negated: false }
      ],
      operator: 'OR' as const
    };
    expect(matchesFromClause('path.md', frontmatter, orFrom)).toBe(true);
  });

  it('should apply FLATTEN correctly', () => {
    const rows = [
      {
        file: { vault: 'test', path: 'a.md', title: 'A' },
        fields: { tags: ['tag1', 'tag2', 'tag3'] }
      },
      {
        file: { vault: 'test', path: 'b.md', title: 'B' },
        fields: { tags: ['tag4'] }
      }
    ];

    const flattened = applyFlatten(rows, 'tags');

    expect(flattened).toHaveLength(4); // 3 from first row + 1 from second row
    expect(flattened[0].fields.tags).toBe('tag1');
    expect(flattened[1].fields.tags).toBe('tag2');
    expect(flattened[2].fields.tags).toBe('tag3');
    expect(flattened[3].fields.tags).toBe('tag4');
  });
});

describe('Integration: End-to-End Query Processing', () => {
  it('should handle complex query with all features', () => {
    const query = `
      TABLE category, COUNT() AS count, AVG(rating) AS avg_rating
      FROM #project OR #work
      WHERE status = "active" AND rating > 3
      GROUP BY category
      SORT avg_rating DESC
      LIMIT 5
    `;

    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.from?.type).toBe('complex');
    expect(parsed.from?.operator).toBe('OR');
    expect(parsed.where).toBe('status = "active" AND rating > 3');
    expect(parsed.groupBy).toEqual(['category']);
    expect(parsed.sort).toEqual({ field: 'avg_rating', direction: 'DESC' });
    expect(parsed.limit).toBe(5);
  });
});

describe('Single-Line Query Parsing (Fix Verification)', () => {
  it('should correctly parse WHERE clause in single-line query', () => {
    const query = 'TABLE status, priority FROM "Testing" WHERE status = "active"';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.fields).toEqual(['status', 'priority']);
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.where).toBe('status = "active"');
  });

  it('should correctly parse SORT clause in single-line query', () => {
    const query = 'TABLE status, priority FROM "Testing" SORT priority DESC';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.fields).toEqual(['status', 'priority']);
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.sort).toEqual({ field: 'priority', direction: 'DESC' });
  });

  it('should correctly parse LIMIT clause in single-line query', () => {
    const query = 'TABLE file.name FROM "Testing" LIMIT 3';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.fields).toEqual(['file.name']);
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.limit).toBe(3);
  });

  it('should correctly parse all clauses combined in single-line query', () => {
    const query = 'TABLE status, priority FROM "Testing" WHERE status != "archived" SORT priority DESC LIMIT 5';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TABLE');
    expect(parsed.fields).toEqual(['status', 'priority']);
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.where).toBe('status != "archived"');
    expect(parsed.sort).toEqual({ field: 'priority', direction: 'DESC' });
    expect(parsed.limit).toBe(5);
  });

  it('should correctly parse LIST query with FROM and LIMIT', () => {
    const query = 'LIST FROM "Testing" LIMIT 5';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('LIST');
    expect(parsed.fields).toEqual(['file.name']); // Default for LIST
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.limit).toBe(5);
  });

  it('should correctly parse TASK query with FROM and WHERE', () => {
    const query = 'TASK FROM "Testing" WHERE completed = false';
    const parsed = parseDataviewQuery(query);

    expect(parsed.type).toBe('TASK');
    expect(parsed.from?.type).toBe('simple');
    expect(parsed.from?.source).toBe('"Testing"');
    expect(parsed.where).toBe('completed = false');
  });
});
