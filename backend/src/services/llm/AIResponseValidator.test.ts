import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIResponseValidator } from './AIResponseValidator';

test('AIResponseValidator.validateGenerateTask: NO_INPUT_* auto-fixes missing inputFormat no-input wording', () => {
  const data = {
    title: 'Друк привітання',
    topic: 'Вивід даних',
    difficulty: 2,
    theoryMarkdown: 'Трохи теорії про стандартний вивід.',
    practicalTask:
      // Must be long enough (> ~180 chars) and must not mention reading from stdin.
      'Напишіть програму, яка виводить на екран привітання у заданому форматі.\n' +
      'Використайте стандартний вивід (stdout). Рядок має містити тільки текст привітання без додаткових підказок.\n' +
      'Зверніть увагу на регістр літер та розділові знаки — результат повинен збігатися символ у символ.',
    ioType: 'NO_INPUT_FIXED_OUTPUT' as const,
    // Intentionally wrong/empty-ish input format; validator should normalize it.
    inputFormat: '—',
    outputFormat: 'Hello, world!',
    constraints: 'Без обмежень.',
    examples: [
      {
        input: '',
        output: 'Hello, world!',
        explanation: 'Програма просто друкує фіксований рядок.'
      }
    ],
    codeTemplate: 'public class Main { public static void main(String[] args) { System.out.print("Hello, world!"); } }'
  };

  const res = AIResponseValidator.validateGenerateTask(data);
  assert.equal(res.ioType, 'NO_INPUT_FIXED_OUTPUT');
  assert.ok(typeof res.inputFormat === 'string' && res.inputFormat.length > 0);
  assert.match(res.inputFormat.toLowerCase(), /вхідні\s+дані\s+відсутн/);
});
