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

test('AIResponseValidator.validateGenerateTask: rejects function-only tasks', () => {
  const data = {
    title: 'Sum Function',
    topic: 'Functions',
    difficulty: 3,
    theoryMarkdown: 'Some theory about functions and return values.',
    practicalTask:
      'Write a function named calculateSum(a, b) that returns the sum of two integers. ' +
      'The function should accept two integers and return their sum without printing anything. ' +
      'Do not write a complete program; only implement the function body.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read two integers from stdin.',
    outputFormat: 'Print the sum of the two integers to stdout.',
    constraints: 'Time limit 1 second. Memory limit 256 MB.',
    examples: [
      {
        input: '3 5',
        output: '8',
        explanation: 'The sum of 3 and 5 is 8.'
      }
    ],
    codeTemplate: 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data),
    /implementing a function\/method\/class/i
  );
});
