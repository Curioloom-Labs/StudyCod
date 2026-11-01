import test from 'node:test';
import assert from 'node:assert/strict';
import router, { eduTestDataGenerationDependencies } from './testData';
import { AppDataSource } from '../../data-source';
import { TopicTask } from '../../entities/TopicTask';
import { TestData } from '../../entities/TestData';

for (const scenario of ['empty-success', 'oracle-failure', 'statement-conflict-repaired', 'statement-conflict-unrepairable', 'tkinter-success'] as const) {
  test(`EDU test generation: ${scenario}`, async t => {
    const authored = [{ input: '3\n1 2 3\n', output: '6\n' }];
    const queries: string[] = [];
    const saved: any[] = [];
    const task = {
      id: 51,
      title: 'Window filter',
      description: 'Read N and N integers; for N < 3 print an empty line.',
      template: '',
      type: 'PRACTICE',
      pythonRuntimeProfile: scenario === 'tkinter-success' ? 'TKINTER' : 'STANDARD',
      topic: { id: 15, title: 'Arrays', language: 'PYTHON', class: { teacher: {} } },
    };
    const query = {
      leftJoinAndSelect() { return this; }, where() { return this; },
      getOne: async () => task,
    };
    let repairedDescription: string | null = null;
    t.mock.method(AppDataSource, 'getRepository', ((entity: unknown) => {
      if (entity === TopicTask) return {
        createQueryBuilder: () => query,
        update: async (criteria: any, values: any) => {
          assert.equal(criteria.id, task.id);
          assert.equal(criteria.description, task.description);
          repairedDescription = values.description;
          return { affected: 1 };
        },
      };
      if (entity === TestData) return { create: (value: unknown) => value, save: async (rows: any[]) => { saved.push(...rows); return rows; } };
      throw new Error('Unexpected repository');
    }) as any);
    t.mock.method(AppDataSource, 'query', (async (sql: string) => {
      queries.push(sql);
      assert.ok(sql.startsWith('SELECT'), 'failed or append generation must not delete existing tests');
      return sql.includes('AS output') ? authored : authored.map(row => ({ input: row.input, expectedOutput: row.output }));
    }) as any);

    let testGenerationAttempts = 0;
    let repairAttempts = 0;
    t.mock.method(eduTestDataGenerationDependencies, 'safeAICall', (async (mode: string, params: any, options: any) => {
      if (mode === 'generateTaskCondition') {
        repairAttempts += 1;
        assert.equal(params.existingDescription, task.description);
        assert.match(params.validationFeedback, /Example 1:.*35.*55/);
        assert.equal(params.topicTitle, 'Arrays');
        assert.equal(options.maxAttempts, 2);
        if (scenario === 'statement-conflict-repaired') {
          return { success: true, data: { description: 'Corrected condition with recomputed examples.' } };
        }
        return { success: false, error: { statusCode: 502, message: 'AI_GENERATION_FAILED', error: 'Repair unavailable' } };
      }

      assert.equal(mode, 'generateTestData');
      testGenerationAttempts += 1;
      assert.equal(params.allowEmptyOutput, true);
      assert.equal(params.referenceExamplesAreAuthoritative, true);
      assert.deepEqual(params.publicExamples, authored);
      if (scenario === 'tkinter-success') {
        assert.equal(params.pythonRuntimeProfile, 'TKINTER');
        assert.equal(params.ioType, 'STDIN_STDOUT');
      }
      assert.equal(options.maxAttempts, 2);
      if (scenario === 'empty-success') return { success: true, data: [{ input: '0\n', output: '\n' }] };
      if (scenario === 'tkinter-success') return { success: true, data: [{
        input: '{"events":[{"type":"click","x":50,"y":20}]}',
        output: '{"geometry":"160x100","title":"Counter","widgets":[]}',
      }] };
      if (scenario === 'oracle-failure') return { success: false, error: {
        statusCode: 400, message: 'AI_GENERATION_FAILED: Invalid response structure',
        details: { validationError: 'Reference program failed on input 3: WA; Wrong answer' },
      } };
      if (testGenerationAttempts === 1) return { success: false, error: {
        statusCode: 400, message: 'AI_GENERATION_FAILED: Invalid response structure',
        details: { validationError: 'TASK_CONTRACT_REVIEW_FAILED[publicExamples]: Example 1: sum of maxima is 35, but expected output is 55.' },
      } };
      assert.equal(params.taskDescription, 'Corrected condition with recomputed examples.');
      return { success: true, data: [{ input: '0\n', output: '\n' }] };
    }) as any);

    const route = router.stack.find((entry: any) => entry.route?.path === '/tasks/:taskId/test-data/generate') as any;
    assert.ok(route);
    let status = 200;
    let body: any;
    const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; }, setHeader() {} };
    await route.route.stack.at(-1).handle({
      userId: 900001,
      userRole: 'SYSTEM_ADMIN',
      params: { taskId: '51' },
      body: { count: 20, replaceGenerated: false },
      headers: { 'x-ui-language': 'en' },
      requestId: 'condition-repair-test',
    }, response);

    if (scenario === 'empty-success') {
      assert.equal(status, 200);
      assert.equal(body.count, 1);
      assert.equal(saved[0].expectedOutput, '\n');
      assert.equal(repairAttempts, 0);
    } else if (scenario === 'oracle-failure') {
      assert.equal(status, 503);
      assert.equal(body.code, 'EDU_TEST_GENERATION_FAILED');
      assert.equal(saved.length, 0);
      assert.equal(repairAttempts, 0);
    } else if (scenario === 'statement-conflict-repaired') {
      assert.equal(status, 200);
      assert.equal(testGenerationAttempts, 2);
      assert.equal(repairAttempts, 1);
      assert.equal(repairedDescription, 'Corrected condition with recomputed examples.');
      assert.equal(body.conditionRepaired, true);
      assert.equal(body.description, repairedDescription);
      assert.equal(saved.length, 1);
    } else if (scenario === 'tkinter-success') {
      assert.equal(status, 200, 'Tkinter tasks must use the validated UI-event generation path');
      assert.equal(body.count, 1);
      assert.equal(saved[0].input, '{"events":[{"type":"click","x":50,"y":20}]}');
      assert.equal(saved[0].expectedOutput, '{"geometry":"160x100","title":"Counter","widgets":[]}');
      assert.equal(saved[0].source, 'AI_GENERATED');
    } else {
      assert.equal(status, 422);
      assert.equal(body.code, 'EDU_TASK_CONDITION_REPAIR_FAILED');
      assert.equal(testGenerationAttempts, 1);
      assert.equal(repairAttempts, 1);
      assert.equal(repairedDescription, null);
      assert.equal(saved.length, 0);
    }
    assert.ok(queries.length > 0);
  });
}
