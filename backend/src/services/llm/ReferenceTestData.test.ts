import test from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { generateReferenceTestData } from './ReferenceTestData';
import { AIValidationError, makeAIValidationError } from './AIResponseValidator';
import { buildTaskValidationFeedback } from './TaskContractReview';

test('EDU reference generation keeps empty boundary outputs through schema validation and review', async () => {
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, instructions?: string): Promise<T> {
      if (++calls === 1) {
        assert.match(instructions ?? '', /Empty stdout or a blank output line is valid/);
        assert.equal(JSON.parse(prompt).authoritativeExamples, true);
        return { referenceSolution: 'print()', inputs: ['0\n', '1\n5\n', '2\n1 2\n', '3\n1 2 3\n'] } as T;
      }
      const payload = JSON.parse(prompt);
      assert.equal(payload.allowEmptyOutput, true);
      assert.deepEqual(payload.candidateTests.map((test: { output: string }) => test.output), ['\n', '']);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Read N and N integers. For N < 3 print an empty line; otherwise print the window sums.',
    lang: 'PYTHON', count: 2, allowEmptyOutput: true, referenceExamplesAreAuthoritative: true,
    executeReference: async () => ['\n', ''],
  });
  assert.deepEqual(result.map(test => test.output), ['\n', '']);
  assert.equal(calls, 2);
});

test('expected outputs come from execution and the reviewer receives the executed source', async () => {
  const source = 'a,b=map(int,input().split()); print(a+b)';
  const inputs = ['2 3', '-7 4'];
  const candidates = [...inputs, '10 1', '0 0'];
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, schema: object, instructions = ''): Promise<T> {
      if (++calls === 1) {
        assert.equal((schema as { properties: object }).properties.hasOwnProperty('tests'), false);
        assert.equal((schema as { properties: { inputs: { minItems: number; maxItems: number } } }).properties.inputs.minItems, 4);
        assert.match(instructions ?? '', /exact line\/token\/record counts/);
        assert.match(instructions ?? '', /letters only/);
        return { referenceSolution: source, inputs: candidates } as T;
      }
      const payload = JSON.parse(prompt);
      assert.equal(payload.executedReference.source, source);
      assert.deepEqual(payload.candidateTests, [{ input: '2 3', output: '5' }, { input: '-7 4', output: '-3' }]);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read integers a and b in [-100,100]. Print a+b as one integer.', lang: 'PYTHON', count: 2,
    executeReference: async (program, stdin) => {
      assert.equal(program, source);
      assert.deepEqual(stdin, inputs);
      return stdin.map(input => String(input.split(' ').map(Number).reduce((a, b) => a + b)));
    },
  });
  assert.deepEqual(tests.map(test => test.output), ['5', '-3']);
  assert.equal(calls, 2);
});

test('floating-point reference oracle follows stated stdout formatting instead of Python defaults', async () => {
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, instructions = ''): Promise<T> {
      calls++;
      if (calls === 1) {
        assert.match(instructions, /never rely on Python's default float printing/);
        return {
          referenceSolution: 'value = float(input()); print(f"{value:.2f}")',
          inputs: ['0', '1', '2'],
        } as T;
      }
      const payload = JSON.parse(prompt);
      assert.deepEqual(payload.candidateTests, [{ input: '0', output: '0.00' }]);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Read a decimal x and print x rounded to exactly two decimal places.',
    lang: 'JAVA',
    count: 1,
    executeReference: async () => ['0.00'],
  });

  assert.deepEqual(
    result.map(({ input, output }) => ({ input, output })),
    [{ input: '0', output: '0.00' }],
  );
});

test('Tkinter reference generation uses validated JSON events and reviews UI snapshots as TKINTER', async () => {
  const source = 'import tkinter as tk\nroot = tk.Tk()\nroot.title("Counter")\nroot.geometry("160x100")\nbutton = tk.Button(root, text="Count: 0")\nbutton.place(x=20, y=10, width=80, height=24)\nroot.mainloop()';
  const input = '{"events":[{"type":"click","x":50,"y":20}]}';
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, instructions = ''): Promise<T> {
      calls++;
      if (calls === 1) {
        assert.match(instructions, /StudyCod's virtual-display Tkinter harness/);
        assert.match(instructions, /must not read stdin, parse JSON, simulate events itself/);
        assert.match(instructions, /JSON UI-event payload strings/);
        assert.match(instructions, /WIDTHxHEIGHT/);
        assert.match(instructions, /explicitly call focus_force\(\) on the statement-defined target before mainloop rather than relying only on focus_set\(\)/);
        assert.match(instructions, /Delete removes at the cursor and has no effect at the end/);
        assert.equal(JSON.parse(prompt).existingExamples[0].input, '{"events":[]}');
        return {
          referenceSolution: source,
          inputs: [
            input,
            '[{"type":"click","x":50,"y":20}]',
            '{"events":[{"type":"click","x":1280,"y":20}]}',
            '{"events":[{"type":"click","x":30,"y":20}]}',
            '{"events":[{"type":"click","x":40,"y":20}]}',
          ],
        } as T;
      }
      const payload = JSON.parse(prompt);
      assert.equal(payload.ioType, 'TKINTER');
      assert.equal(payload.candidateTests[0].input, input);
      assert.equal(payload.candidateTests[0].output, '{"geometry":"160x100","title":"Counter","widgets":[]}');
      assert.equal(payload.executedReference.source, source);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Create a Tkinter window titled Counter with geometry 160x100. Place a button at x=20,y=10,width=80,height=24. Input is a JSON object with events; clicking the button increments its displayed count. Output is the exact JSON snapshot from the virtual display.',
    lang: 'PYTHON',
    count: 1,
    pythonRuntimeProfile: 'TKINTER',
    publicExamples: [{ input: '{"events":[]}', output: '{"geometry":"160x100","title":"Counter","widgets":[]}' }],
    executeReference: async (program, inputs, examples) => {
      assert.equal(program, source);
      assert.deepEqual(inputs, [input], 'canonical duplicate and out-of-range UI event candidates must be discarded');
      assert.equal(examples.length, 1);
      return ['{"geometry":"160x100","title":"Counter","widgets":[]}'];
    },
  });
  assert.deepEqual(result.map(({ input: generatedInput, output }) => ({ input: generatedInput, output })), [{
    input,
    output: '{"geometry":"160x100","title":"Counter","widgets":[]}',
  }]);
  assert.equal(calls, 2);
});

test('Tkinter rejects a console-only oracle before Judge and gives runtime-specific repair feedback', async () => {
  const provider: LLMProvider = {
    async generateJSON<T>() {
      return {
        referenceSolution: 'print("not a Tkinter app")',
        inputs: ['{"events":[]}', '{"events":[{"type":"click","x":40,"y":30}]}', '{"events":[{"type":"click","x":80,"y":40}]}'],
      } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  let judgeCalls = 0;
  await assert.rejects(generateReferenceTestData(provider, {
    taskDescription: 'Create a Tkinter window and react to button clicks.',
    lang: 'PYTHON', count: 1, pythonRuntimeProfile: 'TKINTER',
    executeReference: async () => { judgeCalls++; return ['{}']; },
  }), error => {
    assert.ok(error instanceof AIValidationError);
    assert.match(error.message, /Tkinter reference validation failed:.*Tk\(\).*mainloop\(\)/);
    const feedback = buildTaskValidationFeedback(error.message, error.rawResponse);
    assert.match(feedback, /REPAIR THE REJECTED TKINTER REFERENCE APPLICATION/);
    assert.match(feedback, /constructs exactly one Tk\(\) root/);
    assert.match(feedback, /do not read stdin, parse JSON/);
    return true;
  });
  assert.equal(judgeCalls, 0);
});

test('public example and repeated candidate inputs are discarded before execution', async () => {
  let calls = 0;
  const source = 'a,b=map(int,input().split()); print(a+b)';
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string): Promise<T> {
      if (++calls === 1) return { referenceSolution: source, inputs: ['2 3', '4 5', '4 5', '6 7', '8 9', '10 11'] } as T;
      const payload = JSON.parse(prompt);
      assert.deepEqual(payload.candidateTests.map((test: { input: string }) => test.input), ['4 5', '6 7']);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read two integers a and b in [-100,100]. Print a+b as one integer.', lang: 'PYTHON', count: 2,
    publicExamples: [{ input: '2 3', output: '5' }],
    executeReference: async (program, stdin) => {
      assert.equal(program, source);
      assert.deepEqual(stdin, ['4 5', '6 7']);
      return ['9', '13'];
    },
  });
  assert.deepEqual(tests.map(test => test.output), ['9', '13']);
});

test('a runtime-failing hidden candidate is replaced from the requested reserve', async () => {
  const source = 'a,b=map(int,input().split()); print(a+b)';
  let providerCalls = 0;
  let executionCalls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string): Promise<T> {
      if (++providerCalls === 1) return { referenceSolution: source, inputs: ['1 1', '2 1', '3 1', '4 1'] } as T;
      const payload = JSON.parse(prompt);
      assert.deepEqual(payload.candidateTests, [
        { input: '1 1', output: '2' },
        { input: '3 1', output: '4' },
      ]);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read two integers a and b, then print their sum.',
    lang: 'PYTHON',
    count: 2,
    publicExamples: [{ input: '0 1', output: '1' }],
    executeReference: async (_program, inputs) => {
      executionCalls += 1;
      if (executionCalls === 1) {
        assert.deepEqual(inputs, ['1 1', '2 1']);
        throw makeAIValidationError('generateTestData', 'Reference program failed on input 3: RE; input count mismatch');
      }
      assert.deepEqual(inputs, ['1 1', '3 1']);
      return ['2', '4'];
    },
  });

  assert.deepEqual(tests.map(({ input, output }) => ({ input, output })), [
    { input: '1 1', output: '2' },
    { input: '3 1', output: '4' },
  ]);
  assert.equal(executionCalls, 2);
  assert.equal(providerCalls, 2);
});

test('the candidate reserve replaces several hidden inputs that produce empty output', async () => {
  let providerCalls = 0;
  let executionCalls = 0;
  const inputs = Array.from({ length: 20 }, (_, index) => String(index + 1));
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, schema: object): Promise<T> {
      providerCalls++;
      if (providerCalls === 1) {
        const inputSchema = (schema as { properties: { inputs: { minItems: number; maxItems: number } } }).properties.inputs;
        assert.equal(inputSchema.minItems, 20);
        assert.equal(inputSchema.maxItems, 20);
        return { referenceSolution: 'print(input())', inputs } as T;
      }
      const candidateTests = JSON.parse(prompt).candidateTests;
      assert.equal(candidateTests.length, 15);
      assert.deepEqual(candidateTests[5], { input: '20', output: '20' });
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read one integer and print that integer.',
    lang: 'PYTHON',
    count: 15,
    publicExamples: [
      { input: '100', output: '100' },
      { input: '200', output: '200' },
      { input: '300', output: '300' },
    ],
    executeReference: async (_source, selectedInputs) => {
      executionCalls++;
      assert.equal(selectedInputs[5], executionCalls === 1 ? '6' : String(14 + executionCalls));
      if (executionCalls <= 5) {
        throw makeAIValidationError('generateTestData', 'Reference program failed on input 9: WA; Wrong answer');
      }
      return selectedInputs.map(input => input.trim());
    },
  });

  assert.equal(tests.length, 15);
  assert.equal(executionCalls, 6);
  assert.equal(providerCalls, 2);
});

test('contract review replaces only candidate inputs that violate task constraints', async () => {
  const source = 'print(int(input()))';
  let providerCalls = 0;
  const executedInputs: string[][] = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string): Promise<T> {
      providerCalls++;
      if (providerCalls === 1) {
        return { referenceSolution: source, inputs: ['3', '11', '4', '5'] } as T;
      }
      const candidateTests = JSON.parse(prompt).candidateTests;
      if (providerCalls === 2) {
        assert.deepEqual(candidateTests.map((candidate: { input: string }) => candidate.input), ['3', '11']);
        return {
          valid: false,
          invalidSource: 'candidateTests',
          issues: ['Candidate test 2 violates the constraint that n is between 1 and 10.'],
        } as T;
      }
      assert.deepEqual(candidateTests.map((candidate: { input: string }) => candidate.input), ['3', '4']);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read one integer n. It is guaranteed that 1 <= n <= 10. Print n on one line.',
    lang: 'JAVA',
    count: 2,
    publicExamples: [{ input: '2', output: '2' }],
    executeReference: async (_program, inputs) => {
      executedInputs.push([...inputs]);
      return inputs.map(input => input.trim());
    },
  });

  assert.deepEqual(executedInputs, [['3', '11'], ['3', '4']]);
  assert.deepEqual(tests.map(({ input, output }) => ({ input, output })), [
    { input: '3', output: '3' },
    { input: '4', output: '4' },
  ]);
  assert.equal(providerCalls, 3);
});

test('contract review repairs the Python oracle for a Java-specific decimal rounding mismatch', async () => {
  let providerCalls = 0;
  const executedSources: string[] = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, systemPrompt?: string): Promise<T> {
      providerCalls++;
      const payload = JSON.parse(prompt);
      if (providerCalls === 1) {
        return { referenceSolution: 'print(format(float(input()), ".1f"))', inputs: ['50.55', '50.56', '50.57'] } as T;
      }
      if (providerCalls === 2) {
        assert.equal(payload.candidateTests[0].input, '50.55');
        assert.equal(payload.candidateTests[0].output, '50.5');
        return {
          valid: false,
          invalidSource: 'candidateTests',
          issues: ["Candidate test '50.55' expects output '50.6', but Java decimal formatting rounds this value to '50.6'."],
        } as T;
      }
      if (providerCalls === 3) {
        assert.equal(payload.studentLanguage, 'JAVA');
        assert.deepEqual(payload.reviewFindings.length, 1);
        assert.match(systemPrompt ?? '', /ROUND_HALF_UP/);
        return { referenceSolution: 'from decimal import Decimal, ROUND_HALF_UP\nprint(Decimal(input()).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))' } as T;
      }
      assert.equal(payload.candidateTests[0].input, '50.55');
      assert.equal(payload.candidateTests[0].output, '50.6');
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read one decimal value. Print it rounded to one decimal place using Java Formatter rounding.',
    lang: 'JAVA',
    count: 1,
    publicExamples: [{ input: '0', output: '0.0' }],
    executeReference: async (source, inputs) => {
      executedSources.push(source);
      return [source.includes('ROUND_HALF_UP') ? '50.6' : '50.5'];
    },
  });

  assert.equal(tests[0].input, '50.55');
  assert.equal(tests[0].output, '50.6');
  assert.equal(executedSources.length, 2);
  assert.match(executedSources[1], /ROUND_HALF_UP/);
  assert.equal(providerCalls, 4);
});

test('large reference suites request a small candidate reserve instead of doubling the response', async () => {
  let calls = 0;
  let generationOptions: LLMGenerateOptions | undefined;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> {
      calls++;
      if (calls === 1) {
        generationOptions = options;
        const inputSchema = (schema as { properties: { inputs: { minItems: number; maxItems: number } } }).properties.inputs;
        assert.equal(inputSchema.minItems, 27);
        assert.equal(inputSchema.maxItems, 27);
        assert.match(systemPrompt ?? '', /Input uniqueness is mandatory/);
        assert.match(systemPrompt ?? '', /Pairwise compare the full inputs/);
        return {
          referenceSolution: 'print(input())',
          inputs: Array.from({ length: 27 }, (_, index) => String(index + 1)),
        } as T;
      }
      assert.equal(JSON.parse(prompt).candidateTests.length, 20);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Read one integer and print it.',
    lang: 'PYTHON', count: 20,
    executeReference: async (_source, inputs) => inputs.map(input => input.trim()),
  });

  assert.equal(result.length, 20);
  assert.equal(calls, 2);
  assert.equal(generationOptions?.strictJsonSchema, true);
});

test('insufficient distinct non-public reference inputs cannot reach code execution', async () => {
  for (const inputs of [['2 3', '2 3', '2 3', '2 3'], ['2 3'], ['2 3', ' ', '2 3', '2 3']]) {
    let executions = 0;
    const provider: LLMProvider = {
      async generateJSON<T>() { return { referenceSolution: 'print(5)', inputs } as T; },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    await assert.rejects(generateReferenceTestData(provider, {
      taskDescription: 'Read two integers and print their sum.', lang: 'PYTHON', count: 2,
      publicExamples: [{ input: '2 3', output: '5' }],
      executeReference: async () => { executions++; return ['5', '5']; },
    }), /Reference test generation validation failed/);
    assert.equal(executions, 0);
  }
});

test('candidate input shortages request new inputs without rewriting the reference oracle', async () => {
  const provider: LLMProvider = {
    async generateJSON<T>() {
      return { referenceSolution: 'print(input())', inputs: ['1', '1', '1', '1'] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  await assert.rejects(generateReferenceTestData(provider, {
    taskDescription: 'Read one integer and print it.', lang: 'PYTHON', count: 2,
    publicExamples: [{ input: '0', output: '0' }],
    executeReference: async () => { throw new Error('Must not execute an incomplete candidate suite'); },
  }), (error: unknown) => {
    assert.ok(error instanceof AIValidationError);
    const feedback = buildTaskValidationFeedback(error.message, error.rawResponse);
    assert.match(feedback, /REPAIR THE REFERENCE TEST INPUTS ONLY/);
    assert.match(feedback, /exactly 2 distinct, non-empty, valid inputs/);
    assert.match(feedback, /referenceSolution byte-for-byte unchanged/);
    return true;
  });
});

test('malformed structured reference responses are preserved for a targeted repair', async () => {
  const malformedResponse = { referenceSolution: 'print(input())', inputs: '1' };
  const provider: LLMProvider = {
    async generateJSON<T>() { return malformedResponse as T; },
    async generateText() { throw new Error('Unexpected text call'); },
  };

  await assert.rejects(generateReferenceTestData(provider, {
    taskDescription: 'Read one integer and print it.', lang: 'PYTHON', count: 2,
    executeReference: async () => { throw new Error('Must not execute an invalid response'); },
  }), (error: unknown) => {
    assert.ok(error instanceof AIValidationError);
    assert.deepEqual(error.rawResponse, malformedResponse);
    const feedback = buildTaskValidationFeedback(error.message, error.rawResponse);
    assert.match(feedback, /REPAIR THE REFERENCE TEST INPUTS ONLY/);
    assert.match(feedback, /exactly the required number of distinct, non-empty, valid inputs/);
    assert.match(feedback, /"inputs":"1"/);
    return true;
  });
});

test('a Java or C++ reference is rejected before the Python executor runs', async () => {
  for (const referenceSolution of [
    'public class Main { public static void main(String[] args) { System.out.println(5); } }',
    '#include <iostream>\nint main() { std::cout << 5; }',
  ]) {
    let executions = 0;
    const provider: LLMProvider = {
      async generateJSON<T>() { return { referenceSolution, inputs: ['1', '2', '3'] } as T; },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    await assert.rejects(generateReferenceTestData(provider, {
      taskDescription: 'Read an integer and print its double.', lang: 'JAVA', count: 1,
      executeReference: async () => { executions++; return ['2']; },
    }), /referenceSolution is (JAVA|CPP) code; return a complete Python 3 oracle/);
    assert.equal(executions, 0);
  }
});

test('reference generation exposes validation feedback and clearly requires a Python oracle', async () => {
  const seen: Array<{ payload: Record<string, unknown>; instructions: string }> = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, systemPrompt: string): Promise<T> {
      seen.push({ payload: JSON.parse(prompt), instructions: systemPrompt });
      if (seen.length === 1) return { referenceSolution: 'print(5)', inputs: ['1', '2', '3'] } as T;
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  await generateReferenceTestData(provider, {
    taskDescription: 'Read an integer and print 5.', lang: 'JAVA', count: 1,
    validationFeedback: 'Previous oracle was Java; return Python.',
    executeReference: async () => ['5'],
  });
  assert.equal(seen[0].payload.validationFeedback, 'Previous oracle was Java; return Python.');
  assert.match(seen[0].instructions, /referenceSolution MUST be Python 3 source code/i);
  assert.match(seen[0].instructions, /do not return Java or C\+\+/i);
});

test('compiler failures preserve the rejected Python source for primary-model repair and fresh review', async () => {
  const broken = 'print(int(input()) + )';
  const fixed = 'print(int(input()) + 1)';
  const payloads: Array<Record<string, unknown>> = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, _system?: string, options?: LLMGenerateOptions): Promise<T> {
      payloads.push(JSON.parse(prompt));
      if (payloads.length === 1) return { referenceSolution: broken, inputs: ['2', '3', '4'] } as T;
      if (payloads.length === 2) {
        assert.equal(options?.validationRetry, undefined, 'validation feedback should retry with the configured primary model');
        return { referenceSolution: fixed, inputs: ['2', '3', '4'] } as T;
      }
      assert.equal(payloads.length, 3, 'repair must still undergo independent test review');
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const params = {
    taskDescription: 'Read one integer n in [1,10]. Print n+1.', lang: 'JAVA' as const, count: 1,
    publicExamples: [{ input: '1', output: '2' }],
    executeReference: async (source: string, inputs: string[]) => {
      if (source === broken) throw makeAIValidationError('generateTestData', 'Reference program compilation failed: SyntaxError: invalid syntax');
      assert.equal(source, fixed);
      return inputs.map(input => String(Number(input) + 1));
    },
  };
  let feedback = '';
  await assert.rejects(generateReferenceTestData(provider, params), error => {
    assert.ok(error instanceof AIValidationError);
    feedback = buildTaskValidationFeedback(error.message, error.rawResponse);
    return true;
  });
  const result = await generateReferenceTestData(provider, { ...params, validationFeedback: feedback });
  assert.deepEqual(result.map(test => test.output), ['3']);
  assert.match(feedback, /REPAIR THE REJECTED REFERENCE PROGRAM/);
  assert.ok(feedback.includes(JSON.stringify(broken)), 'quotes in the rejected source must survive feedback serialization');
  assert.equal(payloads[1].statement, params.taskDescription);
  assert.equal(payloads[1].validationFeedback, feedback);
});

test('a malformed Python main guard is repaired before Judge execution and contract review', async () => {
  const malformed = 'if __name__ == "__main__\':\n    print(int(input()) + 1)';
  const repaired = 'if __name__ == "__main__":\n    print(int(input()) + 1)';
  const calls: Array<Record<string, unknown>> = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string): Promise<T> {
      const payload = JSON.parse(prompt) as Record<string, unknown>;
      calls.push(payload);
      if ('requiredCoverage' in payload || 'existingExamples' in payload) {
        return { referenceSolution: malformed, inputs: ['2', '3', '4'] } as T;
      }
      assert.equal((payload.executedReference as { source: string }).source, repaired);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const executions: string[] = [];
  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Read one integer n in [1,10]. Print n+1.',
    lang: 'PYTHON',
    count: 1,
    publicExamples: [{ input: '1', output: '2' }],
    executeReference: async (source, inputs) => {
      executions.push(source);
      if (source === malformed) {
        throw makeAIValidationError('generateTestData', 'Reference program compilation failed: SyntaxError in main guard');
      }
      assert.equal(source, repaired);
      return inputs.map(input => String(Number(input) + 1));
    },
  });

  assert.deepEqual(result.map(test => test.output), ['3']);
  assert.deepEqual(executions, [malformed, repaired]);
  assert.equal(calls.length, 2);
  assert.deepEqual((calls[1].executedReference as { source: string }).source, repaired);
});

test('a leading backslash and a single equals sign in the Python main guard are repaired', async () => {
  const repaired = 'if __name__ == "__main__":\n    print(int(input()) + 1)';
  for (const malformed of [
    '\\if __name__ == "__main__":\n    print(int(input()) + 1)',
    'if __name__ = "__main__":\n    print(int(input()) + 1)',
  ]) {
    const provider: LLMProvider = {
      async generateJSON<T>(prompt: string): Promise<T> {
        const payload = JSON.parse(prompt) as Record<string, unknown>;
        if ('requiredCoverage' in payload || 'existingExamples' in payload) {
          return { referenceSolution: malformed, inputs: ['2', '3', '4'] } as T;
        }
        assert.equal((payload.executedReference as { source: string }).source, repaired);
        return { valid: true, invalidSource: 'none', issues: [] } as T;
      },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    const executions: string[] = [];
    const result = await generateReferenceTestData(provider, {
      taskDescription: 'Read one integer n in [1,10]. Print n+1.',
      lang: 'PYTHON',
      count: 1,
      publicExamples: [{ input: '1', output: '2' }],
      executeReference: async (source, inputs) => {
        executions.push(source);
        if (source === malformed) {
          throw makeAIValidationError('generateTestData', 'Reference program compilation failed: SyntaxError in main guard');
        }
        assert.equal(source, repaired);
        return inputs.map(input => String(Number(input) + 1));
      },
    });

    assert.deepEqual(result.map(test => test.output), ['3']);
    assert.deepEqual(executions, [malformed, repaired]);
  }
});
