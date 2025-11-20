/**
 * Dataview function library
 *
 * Implements the most commonly used Dataview functions:
 * - Date functions: date(), dateformat(), dur()
 * - Array functions: contains(), length(), join(), list(), sort(), reverse()
 * - String functions: lower(), upper(), replace(), split(), regexmatch()
 * - Object functions: default()
 */

import { ExpressionValue, LambdaFunction } from './expression-evaluator.js';

export class DataviewFunctions {
  private functions: Map<string, (...args: ExpressionValue[]) => ExpressionValue>;

  constructor() {
    this.functions = new Map();
    this.registerCoreFunctions();
  }

  call(name: string, args: ExpressionValue[]): ExpressionValue {
    const fn = this.functions.get(name.toLowerCase());
    if (!fn) {
      throw new Error(`Unknown function: ${name}`);
    }
    return fn(...args);
  }

  private registerCoreFunctions(): void {
    // ===== Date Functions =====

    /**
     * date(input) - Parse a date from string, number, or Date object
     * Special values: "today", "tomorrow", "yesterday", "now"
     */
    this.functions.set('date', (input: ExpressionValue) => {
      if (input instanceof Date) return input;

      if (typeof input === 'string') {
        const lower = input.toLowerCase();
        const now = new Date();

        // Handle special date keywords
        if (lower === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return today;
        }
        if (lower === 'tomorrow') {
          const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          return tomorrow;
        }
        if (lower === 'yesterday') {
          const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          return yesterday;
        }
        if (lower === 'now') {
          return now;
        }

        // Regular date parsing
        const parsed = new Date(input);
        return isNaN(parsed.getTime()) ? null : parsed;
      }

      if (typeof input === 'number') {
        return new Date(input);
      }

      return null;
    });

    /**
     * dateformat(date, format) - Format a date (simplified format support)
     * Supports: YYYY, MM, DD, HH, mm, ss
     */
    this.functions.set('dateformat', (dateInput: ExpressionValue, format: ExpressionValue) => {
      if (typeof format !== 'string') return null;

      let date: Date;
      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string') {
        date = new Date(dateInput);
      } else {
        return null;
      }

      if (isNaN(date.getTime())) return null;

      const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');

      let result = format;
      result = result.replace('YYYY', String(date.getFullYear()));
      result = result.replace('YY', String(date.getFullYear()).slice(-2));
      result = result.replace('MM', pad(date.getMonth() + 1));
      result = result.replace('DD', pad(date.getDate()));
      result = result.replace('HH', pad(date.getHours()));
      result = result.replace('mm', pad(date.getMinutes()));
      result = result.replace('ss', pad(date.getSeconds()));

      return result;
    });

    /**
     * dur(input) - Parse duration (simplified - returns seconds)
     * Accepts:
     *   - Short form: "1d", "2h", "30m", "45s"
     *   - Long form: "7 days", "2 weeks", "30 minutes", "45 seconds"
     *   - Combinations: "1d 2h", "2 weeks 3 days"
     */
    this.functions.set('dur', (input: ExpressionValue) => {
      if (typeof input !== 'string') return 0;

      const patterns = [
        { regex: /(\d+)\s*(?:weeks?|w)/gi, multiplier: 604800 },   // weeks
        { regex: /(\d+)\s*(?:days?|d)/gi, multiplier: 86400 },     // days
        { regex: /(\d+)\s*(?:hours?|hrs?|h)/gi, multiplier: 3600 }, // hours
        { regex: /(\d+)\s*(?:minutes?|mins?|m)/gi, multiplier: 60 }, // minutes
        { regex: /(\d+)\s*(?:seconds?|secs?|s)/gi, multiplier: 1 }  // seconds
      ];

      let totalSeconds = 0;
      for (const { regex, multiplier } of patterns) {
        const matches = [...input.matchAll(regex)];
        for (const match of matches) {
          totalSeconds += parseInt(match[1]) * multiplier;
        }
      }

      return totalSeconds;
    });

    // ===== Array Functions =====

    /**
     * contains(array|string, value|substring) - Check if array contains value or string contains substring
     */
    this.functions.set('contains', (input: ExpressionValue, value: ExpressionValue) => {
      // Array membership check
      if (Array.isArray(input)) {
        return input.some(item => this.deepEqual(item, value));
      }
      // String substring search
      if (typeof input === 'string' && typeof value === 'string') {
        return input.includes(value);
      }
      // Convert to string and check
      if (input !== null && input !== undefined && value !== null && value !== undefined) {
        return String(input).includes(String(value));
      }
      return false;
    });

    /**
     * length(array) - Get length of array or string
     */
    this.functions.set('length', (input: ExpressionValue) => {
      if (Array.isArray(input)) return input.length;
      if (typeof input === 'string') return input.length;
      if (input && typeof input === 'object') return Object.keys(input).length;
      return 0;
    });

    /**
     * join(array, separator) - Join array elements with separator
     */
    this.functions.set('join', (array: ExpressionValue, separator: ExpressionValue = ', ') => {
      if (!Array.isArray(array)) return String(array);
      return array.map(String).join(String(separator));
    });

    /**
     * list(...items) - Create array from arguments
     */
    this.functions.set('list', (...items: ExpressionValue[]) => {
      return items;
    });

    /**
     * sort(array, [direction]) - Sort array (ascending by default)
     */
    this.functions.set('sort', (array: ExpressionValue, direction: ExpressionValue = 'asc') => {
      if (!Array.isArray(array)) return array;
      const sorted = [...array];
      const desc = String(direction).toLowerCase() === 'desc';

      sorted.sort((a, b) => {
        if (a < b) return desc ? 1 : -1;
        if (a > b) return desc ? -1 : 1;
        return 0;
      });

      return sorted;
    });

    /**
     * reverse(array) - Reverse array
     */
    this.functions.set('reverse', (array: ExpressionValue) => {
      if (!Array.isArray(array)) return array;
      return [...array].reverse();
    });

    /**
     * filter(array, predicate) - Filter array using a lambda predicate
     * Usage: filter(array, (x) => x > 5)
     */
    this.functions.set('filter', (array: ExpressionValue, predicate?: ExpressionValue) => {
      if (!Array.isArray(array)) return array;
      if (!predicate) return array;

      // Check if predicate is a lambda function
      if (typeof predicate === 'object' && predicate !== null && 'type' in predicate && predicate.type === 'lambda') {
        const lambda = predicate as LambdaFunction;
        const filtered: any[] = [];

        for (const item of array) {
          // Evaluate lambda with current item
          const result = lambda.evaluator.evaluateLambda(lambda, item, {
            frontmatter: null,
            file: { path: '', name: '', folder: '', ext: '' }
          });

          // Add item if predicate returns truthy value
          if (result) {
            filtered.push(item);
          }
        }

        return filtered;
      }

      // If not a lambda, return array as-is
      return array;
    });

    /**
     * map(array, transform) - Map array using a lambda transform function
     * Usage: map(array, (x) => x.name)
     */
    this.functions.set('map', (array: ExpressionValue, transform?: ExpressionValue) => {
      if (!Array.isArray(array)) return array;
      if (!transform) return array;

      // Check if transform is a lambda function
      if (typeof transform === 'object' && transform !== null && 'type' in transform && transform.type === 'lambda') {
        const lambda = transform as LambdaFunction;
        const mapped: any[] = [];

        for (const item of array) {
          // Evaluate lambda with current item
          const result = lambda.evaluator.evaluateLambda(lambda, item, {
            frontmatter: null,
            file: { path: '', name: '', folder: '', ext: '' }
          });

          mapped.push(result);
        }

        return mapped;
      }

      // If not a lambda, return array as-is
      return array;
    });

    // ===== String Functions =====

    /**
     * lower(string) - Convert to lowercase
     */
    this.functions.set('lower', (input: ExpressionValue) => {
      return String(input).toLowerCase();
    });

    /**
     * upper(string) - Convert to uppercase
     */
    this.functions.set('upper', (input: ExpressionValue) => {
      return String(input).toUpperCase();
    });

    /**
     * replace(string, pattern, replacement) - Replace pattern in string
     */
    this.functions.set('replace', (input: ExpressionValue, pattern: ExpressionValue, replacement: ExpressionValue) => {
      if (typeof input !== 'string') return String(input);
      if (typeof pattern !== 'string') return input;
      return input.replace(new RegExp(String(pattern), 'g'), String(replacement));
    });

    /**
     * split(string, separator) - Split string into array
     */
    this.functions.set('split', (input: ExpressionValue, separator: ExpressionValue = ',') => {
      return String(input).split(String(separator));
    });

    /**
     * regexmatch(string, pattern) - Test if string matches regex pattern
     */
    this.functions.set('regexmatch', (input: ExpressionValue, pattern: ExpressionValue) => {
      if (typeof input !== 'string' || typeof pattern !== 'string') return false;
      try {
        return new RegExp(pattern).test(input);
      } catch {
        return false;
      }
    });

    /**
     * regexreplace(string, pattern, replacement) - Replace using regex
     */
    this.functions.set('regexreplace', (input: ExpressionValue, pattern: ExpressionValue, replacement: ExpressionValue) => {
      if (typeof input !== 'string' || typeof pattern !== 'string') return String(input);
      try {
        return input.replace(new RegExp(String(pattern), 'g'), String(replacement));
      } catch {
        return input;
      }
    });

    /**
     * substring(string, start, [end]) - Extract substring
     */
    this.functions.set('substring', (input: ExpressionValue, start: ExpressionValue, end?: ExpressionValue) => {
      const str = String(input);
      const startIdx = typeof start === 'number' ? start : 0;
      const endIdx = typeof end === 'number' ? end : undefined;
      return str.substring(startIdx, endIdx);
    });

    /**
     * startswith(string, prefix) - Check if string starts with prefix
     */
    this.functions.set('startswith', (input: ExpressionValue, prefix: ExpressionValue) => {
      return String(input).startsWith(String(prefix));
    });

    /**
     * endswith(string, suffix) - Check if string ends with suffix
     */
    this.functions.set('endswith', (input: ExpressionValue, suffix: ExpressionValue) => {
      return String(input).endsWith(String(suffix));
    });

    // ===== Object/Utility Functions =====

    /**
     * default(value, defaultValue) - Return defaultValue if value is null/undefined
     */
    this.functions.set('default', (value: ExpressionValue, defaultValue: ExpressionValue) => {
      return value ?? defaultValue;
    });

    /**
     * choice(condition, trueValue, falseValue) - Ternary operator
     */
    this.functions.set('choice', (condition: ExpressionValue, trueValue: ExpressionValue, falseValue: ExpressionValue) => {
      return this.isTruthy(condition) ? trueValue : falseValue;
    });

    /**
     * round(number, [decimals]) - Round number to decimals
     */
    this.functions.set('round', (num: ExpressionValue, decimals: ExpressionValue = 0) => {
      const n = typeof num === 'number' ? num : parseFloat(String(num));
      const d = typeof decimals === 'number' ? decimals : 0;
      const multiplier = Math.pow(10, d);
      return Math.round(n * multiplier) / multiplier;
    });

    /**
     * min(...values) - Get minimum value
     */
    this.functions.set('min', (...values: ExpressionValue[]) => {
      const numbers = values
        .flat()
        .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
        .filter(n => !isNaN(n));
      return numbers.length > 0 ? Math.min(...numbers) : null;
    });

    /**
     * max(...values) - Get maximum value
     */
    this.functions.set('max', (...values: ExpressionValue[]) => {
      const numbers = values
        .flat()
        .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
        .filter(n => !isNaN(n));
      return numbers.length > 0 ? Math.max(...numbers) : null;
    });

    /**
     * sum(...values) - Sum values
     */
    this.functions.set('sum', (...values: ExpressionValue[]) => {
      const numbers = values
        .flat()
        .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
        .filter(n => !isNaN(n));
      return numbers.reduce((a, b) => a + b, 0);
    });

    /**
     * average(...values) - Get average value
     */
    this.functions.set('average', (...values: ExpressionValue[]) => {
      const numbers = values
        .flat()
        .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
        .filter(n => !isNaN(n));
      return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
    });
  }

  private deepEqual(a: ExpressionValue, b: ExpressionValue): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.deepEqual(val, b[idx]));
    }
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.deepEqual((a as any)[key], (b as any)[key]));
    }
    return false;
  }

  private isTruthy(value: ExpressionValue): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (value === 0 || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }
}
