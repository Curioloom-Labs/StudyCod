import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGeneratedTestText, compactOutputFormatForLearner, pickNoInputFixedExpectedOutput, formatStatementSectionValueForMarkdown } from './generatedTaskIO';

test('displayed output contract keeps line breaks and rules following an example marker', () => {
  const contract = 'Print the total followed by a newline character. Example: 0. Then print NONE if there are no matches.';
  assert.equal(compactOutputFormatForLearner(contract, 'STDIN_STDOUT', 'en'), contract);
});

test('test input keeps spaces, literal prefixes, and literal escape sequences', () => {
  const input = '  Input: a\\nb  \n';
  assert.equal(sanitizeGeneratedTestText(input, 'input'), input);
  assert.equal(sanitizeGeneratedTestText('Output: READY', 'output'), 'Output: READY');
});

test('fixed expected output comes from the explicit contract instead of the first example', () => {
  assert.equal(pickNoInputFixedExpectedOutput({ outputFormat: 'READY', examples: [{ input: '', output: 'WRONG' }] }), 'READY');
  assert.equal(pickNoInputFixedExpectedOutput({ examples: [{ input: '', output: 'Guessed answer' }] }), null);
});

test('literal output formatting retains entities, escape sequences and backticks', () => {
  const literal = '`READY`\n&lt;status&gt;\n\\n\\n\\n';
  assert.equal(formatStatementSectionValueForMarkdown(literal, { preferCodeBlock: true }), '```text\n' + literal + '\n```');
  assert.equal(formatStatementSectionValueForMarkdown('```', { preferCodeBlock: true }), '````text\n```\n````');
});
