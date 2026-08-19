import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIResponseValidator } from './AIResponseValidator';

test('AIResponseValidator.validateGenerateTestData: rejects conflicting outputs for the same input', () => {
  assert.throws(
    () => AIResponseValidator.validateGenerateTestData({
      tests: [
        { input: '2', output: 'Tuesday' },
        { input: '2', output: 'Wednesday' }
      ]
    }, 2),
    /conflicting outputs for the same input/i
  );
});

test('AIResponseValidator.validateGenerateTestData: trims one extra provider row to the requested count', () => {
  const result = AIResponseValidator.validateGenerateTestData({
    tests: Array.from({ length: 13 }, (_, index) => ({
      input: String(index + 1),
      output: String((index + 1) * 2),
    })),
  }, 12);

  assert.equal(result.length, 12);
  assert.equal(result[result.length - 1]?.input, '12');
});

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

test('AIResponseValidator.validateGenerateTask: rejects theory copied into practicalTask', () => {
  const data = {
    title: 'If and switch',
    topic: 'Control flow',
    difficulty: 2,
    theoryMarkdown: 'Theory about if and switch.',
    practicalTask: [
      '### Інтуїтивне пояснення',
      'Умова розгалужує виконання програми на кілька шляхів.',
      '',
      '### Що відбувається під час виконання',
      'if перевіряє логічний вираз, а switch вибирає відповідний case.',
      '',
      '### Мінімальний приклад коду',
      'Напишіть повну програму та виведіть результат перевірки.'
    ].join('\n'),
    ioType: 'NO_INPUT_FIXED_OUTPUT' as const,
    inputFormat: 'Вхідних даних немає.',
    outputFormat: 'Виведіть результат перевірки.',
    constraints: 'Використайте повну програму.',
    examples: [{ input: '', output: 'готово', explanation: 'Приклад результату.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) {} }'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data, 'Control flow', 1),
    /practicalTask contains lesson theory/i
  );
});

test('AIResponseValidator.validateGenerateTask: rejects implementation hints in the learner statement', () => {
  const data = {
    title: 'Flow control: if/else; switch',
    topic: 'Flow control: if/else; switch',
    difficulty: 2,
    theoryMarkdown: 'Branching lets a program choose an output from the input state.',
    practicalTask: 'A pedestrian signal reports the current state as a number. For each valid state, print the action that pedestrians should take and keep the output to one line. Ensure your program handles all three states correctly using either if/else statements or a switch statement.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read one integer from stdin.',
    outputFormat: 'Print the corresponding action on one line.',
    constraints: 'The input is a valid state number.',
    examples: [{ input: '1', output: 'Stop', explanation: 'The first state maps to the stop action.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { /* TODO */ } }'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data, 'Flow control: if/else; switch', 2),
    /reveals an implementation technique/i
  );
});

test('AIResponseValidator.validateGenerateTask: rejects empty-output branches', () => {
  const data = {
    title: 'Array filtering',
    topic: 'Arrays and filtering',
    difficulty: 2,
    theoryMarkdown: 'Arrays store a sequence of values.',
    practicalTask:
      'A monitoring tool receives a list of readings and must report the readings that exceed the daily limit. ' +
      'If no reading exceeds the limit, print an empty line; otherwise print the selected readings in their original order. ' +
      'The output must contain only the requested result and no labels or explanations.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read the number of readings, the readings, and the limit from stdin.',
    outputFormat: 'Print the selected readings or an empty line.',
    constraints: 'The list contains between 1 and 100 integers.',
    examples: [{ input: '3 1 2 3 10', output: '1 2 3', explanation: 'No reading exceeds the limit.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { /* TODO */ } }'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data, 'Arrays and filtering', 5),
    /requires empty output/i
  );
});

test('AIResponseValidator.validateGenerateTask: rejects a three-value decision lookup as too shallow', () => {
  const data = {
    title: 'Flow control: if/else; switch',
    topic: 'Flow control: if/else; switch',
    difficulty: 2,
    theoryMarkdown: 'Branching lets a program choose an output from the input state.',
    practicalTask: 'A traffic signal is represented by one integer between 1 and 3. For each possible state, print the corresponding pedestrian action on one line. The input is always one of the three valid states and the output is one message for that state.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'Read one integer between 1 and 3 from stdin.',
    outputFormat: 'Print the corresponding action on one line.',
    constraints: 'The input is one of the three possible states: 1, 2, or 3.',
    examples: [{ input: '1', output: 'Stop', explanation: 'The first state maps to the stop action.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { /* TODO */ } }'
  };

  assert.throws(
    () => AIResponseValidator.validateGenerateTask(data, 'Flow control: if/else; switch', 2),
    /decision task is too shallow/i
  );
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

test('AIResponseValidator.validateGenerateTask: coerces a disallowed stdin type when the statement is no-input', () => {
  const data = {
    title: 'Variables and types',
    topic: 'Data types and variables',
    difficulty: 2,
    theoryMarkdown: 'Variables store values and have types.',
    practicalTask:
      'Write a complete program that assigns the concrete values name = "Ada" and age = 36. ' +
      'Print the value and type of each variable on its own line, with no user interaction or input.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'There is no input.',
    outputFormat: 'name: Ada (str)\nage: 36 (int)',
    constraints: 'Use only the values stated in the task.',
    examples: [{ input: '', output: 'name: Ada (str)\nage: 36 (int)', explanation: 'The program prints both variables.' }],
    codeTemplate: 'def main():\n    pass'
  };

  const result = AIResponseValidator.validateGenerateTask(
    data,
    'Data types and variables',
    1,
    ['NO_INPUT_FIXED_OUTPUT', 'NO_INPUT_FREE_OUTPUT']
  );
  assert.equal(result.ioType, 'NO_INPUT_FIXED_OUTPUT');
  assert.equal(result.examples[0]?.input, '');
});

test('AIResponseValidator.validateGenerateTask: repairs STDIN type when both statement and input format say no input', () => {
  const data = {
    title: 'Fixed status message',
    topic: 'Output and variables',
    difficulty: 2,
    theoryMarkdown: 'A program can print a fixed result without reading stdin.',
    practicalTask:
      'Write a complete program that prints the status message "READY" exactly once. ' +
      'The program must not ask the user for anything and must not read from standard input. ' +
      'Print only the required message without labels or additional explanations.',
    ioType: 'STDIN_STDOUT' as const,
    inputFormat: 'There is no input (stdin is empty).',
    outputFormat: 'READY',
    constraints: 'The output must match exactly.',
    examples: [{ input: '', output: 'READY', explanation: 'The program prints the fixed status.' }],
    codeTemplate: 'public class Main { public static void main(String[] args) { } }'
  };

  const result = AIResponseValidator.validateGenerateTask(data);
  assert.equal(result.ioType, 'NO_INPUT_FIXED_OUTPUT');
  assert.equal(result.examples[0]?.input, '');
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
