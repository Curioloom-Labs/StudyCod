import { logger } from "./logger";
export interface FormulaVariables {
  test: number | null;
  avgPractice: number;
}
interface Token {
  type: 'NUMBER' | 'VARIABLE' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'FUNCTION' | 'COMMA' | 'EOF';
  value: string | number;
}
class Tokenizer {
  private input: string;
  private position: number = 0;
  constructor(input: string) {
    this.input = input.trim();
  }
  private peek(): string | null {
    if (this.position >= this.input.length) return null;
    return this.input[this.position];
  }
  private advance(): string | null {
    if (this.position >= this.input.length) return null;
    return this.input[this.position++];
  }
  private skipWhitespace(): void {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n') {
      this.advance();
    }
  }
  private readNumber(): number {
    let numStr = '';
    while (this.peek() !== null && /[0-9.]/.test(this.peek()!)) {
      numStr += this.advance();
    }
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${numStr}`);
    }
    return num;
  }
  private readIdentifier(): string {
    let ident = '';
    while (this.peek() !== null && /[a-zA-Z_]/.test(this.peek()!)) {
      ident += this.advance();
    }
    return ident;
  }
  nextToken(): Token {
    this.skipWhitespace();
    if (this.position >= this.input.length) {
      return {
        type: 'EOF',
        value: ''
      };
    }
    const char = this.peek()!;
    if (/[0-9]/.test(char)) {
      return {
        type: 'NUMBER',
        value: this.readNumber()
      };
    }
    if (char === '+') {
      this.advance();
      return {
        type: 'OPERATOR',
        value: '+'
      };
    }
    if (char === '-') {
      this.advance();
      return {
        type: 'OPERATOR',
        value: '-'
      };
    }
    if (char === '*') {
      this.advance();
      return {
        type: 'OPERATOR',
        value: '*'
      };
    }
    if (char === '/') {
      this.advance();
      return {
        type: 'OPERATOR',
        value: '/'
      };
    }
    if (char === '(') {
      this.advance();
      return {
        type: 'LPAREN',
        value: '('
      };
    }
    if (char === ')') {
      this.advance();
      return {
        type: 'RPAREN',
        value: ')'
      };
    }
    if (char === ',') {
      this.advance();
      return {
        type: 'COMMA',
        value: ','
      };
    }
    if (/[a-zA-Z_]/.test(char)) {
      const ident = this.readIdentifier();
      if (this.peek() === '(') {
        return {
          type: 'FUNCTION',
          value: ident
        };
      }
      return {
        type: 'VARIABLE',
        value: ident
      };
    }
    throw new Error(`Unexpected character: ${char} at position ${this.position}`);
  }
}
class Parser {
  private tokenizer: Tokenizer;
  private currentToken: Token;
  constructor(input: string) {
    this.tokenizer = new Tokenizer(input);
    this.currentToken = this.tokenizer.nextToken();
  }
  private eat(expectedType: Token['type']): Token {
    const token = this.currentToken;
    if (token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type}`);
    }
    this.currentToken = this.tokenizer.nextToken();
    return token;
  }
  private parseExpression(): number {
    return this.parseAddition();
  }
  private parseAddition(): number {
    let result = this.parseMultiplication();
    while (this.currentToken.type === 'OPERATOR' && (this.currentToken.value === '+' || this.currentToken.value === '-')) {
      const op = this.currentToken.value as string;
      this.eat('OPERATOR');
      const right = this.parseMultiplication();
      if (op === '+') {
        result = result + right;
      } else {
        result = result - right;
      }
    }
    return result;
  }
  private parseMultiplication(): number {
    let result = this.parseUnary();
    while (this.currentToken.type === 'OPERATOR' && (this.currentToken.value === '*' || this.currentToken.value === '/')) {
      const op = this.currentToken.value as string;
      this.eat('OPERATOR');
      const right = this.parseUnary();
      if (op === '*') {
        result = result * right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        result = result / right;
      }
    }
    return result;
  }
  private parseUnary(): number {
    if (this.currentToken.type === 'OPERATOR' && this.currentToken.value === '-') {
      this.eat('OPERATOR');
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }
  private parsePrimary(): number {
    if (this.currentToken.type === 'NUMBER') {
      const value = this.currentToken.value as number;
      this.eat('NUMBER');
      return value;
    }
    if (this.currentToken.type === 'LPAREN') {
      this.eat('LPAREN');
      const result = this.parseExpression();
      this.eat('RPAREN');
      return result;
    }
    if (this.currentToken.type === 'FUNCTION') {
      return this.parseFunction();
    }
    if (this.currentToken.type === 'VARIABLE') {
      return this.parseVariable();
    }
    throw new Error(`Unexpected token: ${this.currentToken.type}`);
  }
  private parseFunction(): number {
    const funcName = this.currentToken.value as string;
    this.eat('FUNCTION');
    this.eat('LPAREN');
    if (funcName.toLowerCase() === 'avg') {
      const arg = this.parseVariable();
      this.eat('RPAREN');
      throw new Error('avg() function must be used as avg(practice)');
    }
    throw new Error(`Unknown function: ${funcName}`);
  }
  private parseVariable(): number {
    const varName = this.currentToken.value as string;
    this.eat('VARIABLE');
    throw new Error(`Variable ${varName} not substituted`);
  }
  parse(variables: FormulaVariables): number {
    try {
      const result = this.parseExpression();
      if (this.currentToken.type !== 'EOF') {
        throw new Error(`Unexpected token after expression: ${this.currentToken.type}`);
      }
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Parse error: ${message}`);
    }
  }
}
export function evaluateFormula(formula: string | null | undefined, variables: FormulaVariables): number {
  if (!formula || formula.trim() === "") {
    return calculateDefaultGrade(variables);
  }
  try {
    let expression = formula.trim();
    const avgPracticeRegex = /avg\s*\(\s*practice\s*\)/gi;
    expression = expression.replace(avgPracticeRegex, variables.avgPractice.toString());
    const testValue = variables.test !== null ? variables.test : 0;
    const testRegex = /\btest\b/gi;
    expression = expression.replace(testRegex, testValue.toString());
    const parser = new Parser(expression);
    const result = parser.parse(variables);
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      throw new Error(`Invalid calculation result: ${result}`);
    }
    return Math.max(0, Math.min(100, Math.round(result)));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Safe formula evaluation failed", {
      hasFormula: Boolean(formula && formula.trim()),
      error: message
    });
    return calculateDefaultGrade(variables);
  }
}
function calculateDefaultGrade(variables: FormulaVariables): number {
  const {
    test,
    avgPractice
  } = variables;
  let result = 0;
  if (test !== null && avgPractice > 0) {
    result = 0.35 * test + 0.65 * avgPractice;
  } else if (test !== null) {
    result = test;
  } else if (avgPractice > 0) {
    result = avgPractice;
  }
  return Math.max(0, Math.min(100, Math.round(result)));
}
export function validateFormula(formula: string): boolean {
  if (!formula || formula.trim() === "") {
    return true;
  }
  try {
    const variables: FormulaVariables = {
      test: 8,
      avgPractice: 7.5
    };
    let expression = formula.trim();
    const avgPracticeRegex = /avg\s*\(\s*practice\s*\)/gi;
    expression = expression.replace(avgPracticeRegex, variables.avgPractice.toString());
    const testValue = variables.test !== null ? variables.test : 0;
    const testRegex = /\btest\b/gi;
    expression = expression.replace(testRegex, testValue.toString());
    const parser = new Parser(expression);
    const result = parser.parse(variables);
    return typeof result === "number" && !Number.isNaN(result) && Number.isFinite(result);
  } catch {
    return false;
  }
}