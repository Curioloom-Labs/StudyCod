import assert from 'node:assert/strict';
import test from 'node:test';
import { ASTAnalyzer } from './ASTAnalyzer';

const submission = (code: string, language: 'JAVA' | 'PYTHON') => ({
  code,
  language,
  taskId: 1,
  userId: 1,
  testData: [],
});

test('AST analyzer reports Python recursion and function metrics', async () => {
  const result = await new ASTAnalyzer().analyze(submission(
    [
      'def factorial(n):',
      '    if n <= 1:',
      '        return 1',
      '    return n * factorial(n - 1)',
    ].join('\n'),
    'PYTHON',
  ));

  assert.equal(result.metrics.functionCount, 1);
  assert.equal(result.metrics.hasLoops, false);
  assert.equal(result.metrics.hasRecursion, true);
  assert.ok(result.suggestions.some((item) => item.message.includes('базового випадку')));
});

test('AST analyzer reports Java methods and loops', async () => {
  const result = await new ASTAnalyzer().analyze(submission(
    [
      'class Example {',
      '  public static void main(String[] args) {',
      '    for (int i = 0; i < 3; i++) {',
      '      System.out.println(i);',
      '    }',
      '  }',
      '  public int sum(int left, int right) { return left + right; }',
      '}',
    ].join('\n'),
    'JAVA',
  ));

  assert.equal(result.metrics.functionCount, 2);
  assert.equal(result.metrics.hasLoops, true);
  assert.equal(result.violations.some((item) => item.type === 'FORBIDDEN_CONSTRUCT'), false);
});

test('AST analyzer flags Python eval and keeps score bounded', async () => {
  const result = await new ASTAnalyzer().analyze(submission(
    'def unsafe(value):\n    return eval(value)',
    'PYTHON',
  ));

  assert.equal(result.violations.some((item) => item.type === 'FORBIDDEN_CONSTRUCT'), true);
  assert.ok(result.complexityScore >= 0 && result.complexityScore <= 1);
});

test('AST analyzer ignores control words inside strings and comments', async () => {
  const result = await new ASTAnalyzer().analyze(submission(
    [
      'def render():',
      '    message = "if for while eval"',
      '    # if for while',
      '    return message',
    ].join('\n'),
    'PYTHON',
  ));

  assert.equal(result.metrics.cyclomaticComplexity, 1);
  assert.equal(result.metrics.hasLoops, false);
  assert.equal(result.violations.some((item) => item.type === 'FORBIDDEN_CONSTRUCT'), false);
});

test('AST analyzer includes Java constructors and nested control depth', async () => {
  const result = await new ASTAnalyzer().analyze(submission(
    [
      'class Example {',
      '  Example(boolean enabled) {',
      '    if (enabled) {',
      '      while (enabled) {',
      '        if (enabled) { System.out.println("ready"); }',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    'JAVA',
  ));

  assert.equal(result.metrics.functionCount, 1);
  assert.equal(result.metrics.hasLoops, true);
  assert.ok(result.metrics.maxNestingDepth >= 3);
});
