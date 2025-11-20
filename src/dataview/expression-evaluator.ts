/**
 * Expression evaluator for Dataview WHERE clauses
 *
 * Supports:
 * - Comparisons: =, !=, <, >, <=, >=
 * - Logical operators: AND, OR, NOT
 * - Property access: field.subfield, field[index]
 * - Function calls: date(value), contains(array, value)
 * - Literals: strings, numbers, booleans, null
 */

import { DataviewFunctions } from './functions.js';

export type ExpressionValue = string | number | boolean | null | Date | any[] | Record<string, any>;

export interface EvaluationContext {
  frontmatter: Record<string, any> | null;
  file: {
    path: string;
    name: string;
    folder: string;
    ext: string;
  };
  body?: string;
}

/**
 * Expression AST nodes
 */
export type ExpressionNode =
  | { type: 'literal'; value: ExpressionValue }
  | { type: 'identifier'; name: string }
  | { type: 'property'; object: ExpressionNode; property: string | number }
  | { type: 'binary'; operator: string; left: ExpressionNode; right: ExpressionNode }
  | { type: 'logical'; operator: 'AND' | 'OR'; left: ExpressionNode; right: ExpressionNode }
  | { type: 'unary'; operator: string; argument: ExpressionNode }
  | { type: 'function'; name: string; arguments: ExpressionNode[] };

/**
 * Tokenize expression string
 */
interface Token {
  type: 'identifier' | 'number' | 'string' | 'operator' | 'punctuation' | 'keyword';
  value: string;
  position: number;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const keywords = new Set(['AND', 'OR', 'NOT', 'true', 'false', 'null']);

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }

    // String literal (double or single quotes)
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i];
      let value = '';
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          value += expr[i + 1];
          i += 2;
        } else {
          value += expr[i];
          i++;
        }
      }
      i++; // Skip closing quote
      tokens.push({ type: 'string', value, position: i });
      continue;
    }

    // Number literal
    if (/\d/.test(expr[i]) || (expr[i] === '-' && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let value = '';
      if (expr[i] === '-') {
        value += expr[i];
        i++;
      }
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        value += expr[i];
        i++;
      }
      tokens.push({ type: 'number', value, position: i });
      continue;
    }

    // Operators (multi-character first)
    if (i + 1 < expr.length) {
      const twoChar = expr.substring(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar, position: i });
        i += 2;
        continue;
      }
    }

    // Single character operators
    if (['<', '>', '=', '!', '+', '-', '*', '/', '%'].includes(expr[i])) {
      tokens.push({ type: 'operator', value: expr[i], position: i });
      i++;
      continue;
    }

    // Punctuation
    if (['(', ')', '[', ']', '.', ','].includes(expr[i])) {
      tokens.push({ type: 'punctuation', value: expr[i], position: i });
      i++;
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(expr[i])) {
      let value = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        value += expr[i];
        i++;
      }
      const upperValue = value.toUpperCase();
      const type = keywords.has(upperValue) ? 'keyword' : 'identifier';
      tokens.push({ type, value: upperValue === value ? upperValue : value, position: i });
      continue;
    }

    // Unknown character - skip
    i++;
  }

  return tokens;
}

/**
 * Parse tokens into AST
 */
class ExpressionParser {
  private tokens: Token[];
  private position: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.position = 0;
  }

  private peek(): Token | null {
    return this.position < this.tokens.length ? this.tokens[this.position] : null;
  }

  private consume(): Token | null {
    if (this.position < this.tokens.length) {
      return this.tokens[this.position++];
    }
    return null;
  }

  private expect(type: string, value?: string): Token {
    const token = this.peek();
    if (!token) {
      throw new Error(`Expected ${type}${value ? ` '${value}'` : ''} but got end of input`);
    }
    if (token.type !== type || (value && token.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` '${value}'` : ''} but got ${token.type} '${token.value}'`);
    }
    return this.consume()!;
  }

  parse(): ExpressionNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ExpressionNode {
    let left = this.parseLogicalAnd();

    while (this.peek()?.type === 'keyword' && this.peek()?.value === 'OR') {
      this.consume();
      const right = this.parseLogicalAnd();
      left = { type: 'logical', operator: 'OR', left, right };
    }

    return left;
  }

  private parseLogicalAnd(): ExpressionNode {
    let left = this.parseComparison();

    while (this.peek()?.type === 'keyword' && this.peek()?.value === 'AND') {
      this.consume();
      const right = this.parseComparison();
      left = { type: 'logical', operator: 'AND', left, right };
    }

    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();

    const token = this.peek();
    if (token?.type === 'operator' && ['=', '==', '!=', '<', '>', '<=', '>='].includes(token.value)) {
      const operator = this.consume()!.value;
      const right = this.parseAdditive();
      // Normalize == to =
      const normalizedOp = operator === '==' ? '=' : operator;
      return { type: 'binary', operator: normalizedOp, left, right };
    }

    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();

    while (this.peek()?.type === 'operator' && ['+', '-'].includes(this.peek()!.value)) {
      const operator = this.consume()!.value;
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator, left, right };
    }

    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();

    while (this.peek()?.type === 'operator' && ['*', '/', '%'].includes(this.peek()!.value)) {
      const operator = this.consume()!.value;
      const right = this.parseUnary();
      left = { type: 'binary', operator, left, right };
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();

    // NOT keyword
    if (token?.type === 'keyword' && token.value === 'NOT') {
      this.consume();
      const argument = this.parseUnary();
      return { type: 'unary', operator: 'NOT', argument };
    }

    // Unary minus
    if (token?.type === 'operator' && token.value === '-') {
      this.consume();
      const argument = this.parseUnary();
      return { type: 'unary', operator: '-', argument };
    }

    // Unary plus
    if (token?.type === 'operator' && token.value === '+') {
      this.consume();
      return this.parseUnary();
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();

    while (true) {
      const token = this.peek();

      // Property access: obj.prop
      if (token?.type === 'punctuation' && token.value === '.') {
        this.consume();
        const propToken = this.expect('identifier');
        expr = { type: 'property', object: expr, property: propToken.value };
        continue;
      }

      // Array/object access: obj[index]
      if (token?.type === 'punctuation' && token.value === '[') {
        this.consume();
        const indexExpr = this.parseLogicalOr();
        this.expect('punctuation', ']');

        // If index is a literal, extract the value
        if (indexExpr.type === 'literal') {
          expr = { type: 'property', object: expr, property: indexExpr.value as string | number };
        } else {
          // For dynamic indices, we need to evaluate the index expression
          // For now, treat as property access with the expression
          expr = { type: 'property', object: expr, property: 0 }; // Placeholder
        }
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    // Parenthesized expression
    if (token.type === 'punctuation' && token.value === '(') {
      this.consume();
      const expr = this.parseLogicalOr();
      this.expect('punctuation', ')');
      return expr;
    }

    // String literal
    if (token.type === 'string') {
      this.consume();
      return { type: 'literal', value: token.value };
    }

    // Number literal
    if (token.type === 'number') {
      this.consume();
      return { type: 'literal', value: parseFloat(token.value) };
    }

    // Boolean and null literals
    if (token.type === 'keyword') {
      if (token.value === 'true') {
        this.consume();
        return { type: 'literal', value: true };
      }
      if (token.value === 'false') {
        this.consume();
        return { type: 'literal', value: false };
      }
      if (token.value === 'null') {
        this.consume();
        return { type: 'literal', value: null };
      }
    }

    // Function call or identifier
    if (token.type === 'identifier') {
      const name = token.value;
      this.consume();

      // Check if it's a function call
      if (this.peek()?.type === 'punctuation' && this.peek()?.value === '(') {
        this.consume(); // (
        const args: ExpressionNode[] = [];

        if (this.peek()?.type !== 'punctuation' || this.peek()?.value !== ')') {
          args.push(this.parseLogicalOr());

          while (this.peek()?.type === 'punctuation' && this.peek()?.value === ',') {
            this.consume(); // ,
            args.push(this.parseLogicalOr());
          }
        }

        this.expect('punctuation', ')');
        return { type: 'function', name, arguments: args };
      }

      // Just an identifier
      return { type: 'identifier', name };
    }

    throw new Error(`Unexpected token: ${token.type} '${token.value}'`);
  }
}

/**
 * Evaluate expression AST
 */
export class ExpressionEvaluator {
  private functions: DataviewFunctions;

  constructor() {
    this.functions = new DataviewFunctions();
  }

  evaluate(expr: string, context: EvaluationContext): ExpressionValue {
    try {
      const tokens = tokenize(expr);
      const parser = new ExpressionParser(tokens);
      const ast = parser.parse();
      return this.evaluateNode(ast, context);
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private evaluateNode(node: ExpressionNode, context: EvaluationContext): ExpressionValue {
    switch (node.type) {
      case 'literal':
        return node.value;

      case 'identifier':
        return this.resolveIdentifier(node.name, context);

      case 'property':
        const obj = this.evaluateNode(node.object, context);
        return this.getProperty(obj, node.property);

      case 'binary':
        return this.evaluateBinary(node.operator, node.left, node.right, context);

      case 'logical':
        return this.evaluateLogical(node.operator, node.left, node.right, context);

      case 'unary':
        return this.evaluateUnary(node.operator, node.argument, context);

      case 'function':
        return this.evaluateFunction(node.name, node.arguments, context);

      default:
        throw new Error(`Unknown node type: ${(node as any).type}`);
    }
  }

  private resolveIdentifier(name: string, context: EvaluationContext): ExpressionValue {
    // Special identifiers
    if (name === 'file') {
      return context.file;
    }

    // Frontmatter field
    // Must check that frontmatter is an object before using 'in' operator
    if (context.frontmatter && typeof context.frontmatter === 'object' && !Array.isArray(context.frontmatter) && name in context.frontmatter) {
      return context.frontmatter[name];
    }

    // Undefined field
    return null;
  }

  private getProperty(obj: ExpressionValue, property: string | number): ExpressionValue {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        if (typeof property === 'number') {
          return obj[property] ?? null;
        }
        // Array methods
        if (property === 'length') {
          return obj.length;
        }
      } else {
        return (obj as any)[property] ?? null;
      }
    }

    return null;
  }

  private evaluateBinary(
    operator: string,
    left: ExpressionNode,
    right: ExpressionNode,
    context: EvaluationContext
  ): ExpressionValue {
    const leftVal = this.evaluateNode(left, context);
    const rightVal = this.evaluateNode(right, context);

    switch (operator) {
      case '=':
        return this.compareEqual(leftVal, rightVal);
      case '!=':
        return !this.compareEqual(leftVal, rightVal);
      case '<':
        return this.compareLessThan(leftVal, rightVal);
      case '>':
        return this.compareLessThan(rightVal, leftVal);
      case '<=':
        return this.compareEqual(leftVal, rightVal) || this.compareLessThan(leftVal, rightVal);
      case '>=':
        return this.compareEqual(leftVal, rightVal) || this.compareLessThan(rightVal, leftVal);
      case '+':
        return (leftVal as number) + (rightVal as number);
      case '-':
        return (leftVal as number) - (rightVal as number);
      case '*':
        return (leftVal as number) * (rightVal as number);
      case '/':
        return (leftVal as number) / (rightVal as number);
      case '%':
        return (leftVal as number) % (rightVal as number);
      default:
        throw new Error(`Unknown binary operator: ${operator}`);
    }
  }

  private compareEqual(left: ExpressionValue, right: ExpressionValue): boolean {
    // Date comparison
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() === right.getTime();
    }
    if (left instanceof Date || right instanceof Date) {
      const leftTime = left instanceof Date ? left.getTime() : new Date(left as string).getTime();
      const rightTime = right instanceof Date ? right.getTime() : new Date(right as string).getTime();
      return leftTime === rightTime;
    }

    // Array comparison
    if (Array.isArray(left) && Array.isArray(right)) {
      return JSON.stringify(left) === JSON.stringify(right);
    }

    // Standard comparison
    return left === right;
  }

  private compareLessThan(left: ExpressionValue, right: ExpressionValue): boolean {
    // Date comparison
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() < right.getTime();
    }
    if (left instanceof Date || right instanceof Date) {
      const leftTime = left instanceof Date ? left.getTime() : new Date(left as string).getTime();
      const rightTime = right instanceof Date ? right.getTime() : new Date(right as string).getTime();
      return leftTime < rightTime;
    }

    // Numeric/string comparison
    if (typeof left === 'number' && typeof right === 'number') {
      return left < right;
    }
    if (typeof left === 'string' && typeof right === 'string') {
      return left < right;
    }

    return false;
  }

  private evaluateLogical(
    operator: 'AND' | 'OR',
    left: ExpressionNode,
    right: ExpressionNode,
    context: EvaluationContext
  ): boolean {
    const leftVal = this.evaluateNode(left, context);

    if (operator === 'AND') {
      if (!this.isTruthy(leftVal)) return false;
      const rightVal = this.evaluateNode(right, context);
      return this.isTruthy(rightVal);
    }

    if (operator === 'OR') {
      if (this.isTruthy(leftVal)) return true;
      const rightVal = this.evaluateNode(right, context);
      return this.isTruthy(rightVal);
    }

    throw new Error(`Unknown logical operator: ${operator}`);
  }

  private evaluateUnary(operator: string, argument: ExpressionNode, context: EvaluationContext): ExpressionValue {
    const val = this.evaluateNode(argument, context);

    switch (operator) {
      case 'NOT':
        return !this.isTruthy(val);
      case '-':
        return -(val as number);
      default:
        throw new Error(`Unknown unary operator: ${operator}`);
    }
  }

  private evaluateFunction(name: string, args: ExpressionNode[], context: EvaluationContext): ExpressionValue {
    const evaluatedArgs = args.map(arg => this.evaluateNode(arg, context));
    return this.functions.call(name, evaluatedArgs);
  }

  private isTruthy(value: ExpressionValue): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (value === 0 || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }
}
