import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIResponseValidator } from './AIResponseValidator';

test('AIResponseValidator.validateGenerateTask: rejects no-input task that asks for a name', () => {
  const data = {
    title: 'Персональне привітання',
    topic: 'Вивід даних',
    difficulty: 1,
    theoryMarkdown: 'Теорія про виведення тексту.',
    practicalTask:
      'Напишіть повну програму, яка спочатку виводить рядок Hello, World!, а потім запитує ім’я користувача та читає його з консолі. ' +
      'Після введення імені програма повинна вивести персоналізоване привітання у точно заданому форматі. ' +
      'Не додавайте до результату пояснень або зайвих рядків.',
    ioType: 'NO_INPUT_FIXED_OUTPUT' as const,
    inputFormat: 'Вхідних даних немає.',
    outputFormat: 'Hello, World!\nВведіть ваше ім’я:',
    constraints: 'Без додаткових обмежень.',
    examples: [{
      input: 'Олена',
      output: 'Hello, World!\nПривіт, Олено!',
      explanation: 'Ім’я вводиться користувачем.'
    }],
    codeTemplate: 'public class Main {}'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data),
    /inputFormat and practicalTask contradict the selected IO type/i
  );
});

test('AIResponseValidator.validateGenerateTask: allows a concise first Hello World task', () => {
  const data = {
    title: 'Hello World',
    topic: 'Introduction to Java',
    difficulty: 1,
    theoryMarkdown: 'A Java program starts in the main method.',
    practicalTask: 'Write a complete program that prints exactly "Hello, World!" once.',
    ioType: 'NO_INPUT_FIXED_OUTPUT' as const,
    inputFormat: 'There is no input.',
    outputFormat: 'Hello, World!',
    constraints: 'Print the exact text once.',
    examples: [{ input: '', output: 'Hello, World!', explanation: 'The program prints the required greeting.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { /* TODO */ } }'
  };

  assert.doesNotThrow(() => AIResponseValidator.validateGenerateTask(data, 'Introduction to Java', 0));
});

test('AIResponseValidator.validateGenerateTask: expands a short non-intro statement from its contracts', () => {
  const data = {
    title: 'Temperature conversion',
    topic: 'Variables and arithmetic',
    difficulty: 2,
    theoryMarkdown: 'Variables store values and arithmetic expressions calculate new values.',
    practicalTask: 'Write a program that converts a Celsius temperature to Fahrenheit.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read one real number c from stdin.',
    outputFormat: 'Print one real number equal to c * 9 / 5 + 32.',
    constraints: 'The input value is between -100 and 100.',
    examples: [{ input: '20', output: '68', explanation: 'Twenty Celsius degrees equal sixty-eight Fahrenheit degrees.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { } }'
  };

  const result = AIResponseValidator.validateGenerateTask(data, 'Variables and arithmetic', 1);
  assert.ok(result.practicalTask.length >= 180);
  assert.match(result.practicalTask, /converts a Celsius temperature/i);
  assert.match(result.practicalTask, /input format/i);
});

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

test('AIResponseValidator.validateGenerateTask: allows method-oriented tasks on a methods topic', () => {
  const data = {
    title: 'Overloaded sum methods',
    topic: 'Methods; parameters; overloading',
    difficulty: 3,
    theoryMarkdown: 'Methods can receive parameters and be overloaded by signature.',
    practicalTask:
      'Write a complete program with main() that reads two integers and uses overloaded methods to calculate their sum. ' +
      'The program must define one method for two values and another overloaded method for three values, then print the result from main(). ' +
      'The solution must produce the answer through standard output.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read two integers from stdin.',
    outputFormat: 'Print one integer containing the sum to stdout.',
    constraints: 'The input integers are between 0 and 1000.',
    examples: [{ input: '3 5', output: '8', explanation: 'The two input values sum to 8.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { } }'
  };

  assert.doesNotThrow(() =>
    AIResponseValidator.validateGenerateTask(data, 'Methods; parameters; overloading')
  );
});
