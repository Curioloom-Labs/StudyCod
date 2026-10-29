import test from 'node:test';
import assert from 'node:assert/strict';
import router, { eduTestDataGenerationDependencies } from './testData';
import { AppDataSource } from '../../data-source';
import { TopicTask } from '../../entities/TopicTask';
import { TestData } from '../../entities/TestData';

for (const scenario of ['empty-success', 'oracle-failure', 'statement-conflict'] as const) {
  test(`EDU test generation: ${scenario}`, async t => {
    const authored = [{ input: '3\n1 2 3\n', output: '6\n' }];
    const queries: string[] = [];
    const saved: any[] = [];
    const query = {
      leftJoinAndSelect() { return this; }, where() { return this; },
      getOne: async () => ({ title: 'Window filter', description: 'Read N and N integers; for N < 3 print an empty line.', topic: { language: 'PYTHON', class: { teacher: {} } } }),
    };
    t.mock.method(AppDataSource, 'getRepository', ((entity: unknown) => {
      if (entity === TopicTask) return { createQueryBuilder: () => query };
      if (entity === TestData) return { create: (value: unknown) => value, save: async (rows: any[]) => { saved.push(...rows); return rows; } };
      throw new Error('Unexpected repository');
    }) as any);
    t.mock.method(AppDataSource, 'query', (async (sql: string) => {
      queries.push(sql);
      assert.ok(sql.startsWith('SELECT'), 'must not delete existing tests during an append or failed generation');
      return sql.includes('AS output') ? authored : authored.map(row => ({ input: row.input, expectedOutput: row.output }));
    }) as any);
    t.mock.method(eduTestDataGenerationDependencies, 'safeAICall', (async (mode: string, params: any, options: any) => {
      assert.equal(mode, 'generateTestData');
      assert.equal(params.allowEmptyOutput, true);
      assert.equal(params.referenceExamplesAreAuthoritative, true);
      assert.deepEqual(params.publicExamples, authored);
      assert.equal(options.maxAttempts, 2);
      if (scenario === 'empty-success') return { success: true, data: [{ input: '0\n', output: '\n' }] };
      return { success: false, error: {
        statusCode: 400, message: 'AI_GENERATION_FAILED: Invalid response structure',
        details: { validationError: scenario === 'statement-conflict' ? 'TASK_CONTRACT_REVIEW_FAILED[statement]: Conflicting examples.' : 'Reference program failed on input 3: WA; Wrong answer' },
      } };
    }) as any);
    const route = router.stack.find((entry: any) => entry.route?.path === '/tasks/:taskId/test-data/generate') as any;
    assert.ok(route);
    let status = 200;
    let body: any;
    const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; }, setHeader() {} };
    await route.route.stack.at(-1).handle({ userId: 900001, userRole: 'SYSTEM_ADMIN', params: { taskId: '51' }, body: { count: 20, replaceGenerated: scenario !== 'empty-success' }, headers: { 'x-ui-language': 'en' } }, response);
    if (scenario === 'empty-success') {
      assert.equal(status, 200);
      assert.equal(body.count, 1);
      assert.equal(saved[0].expectedOutput, '\n');
    } else {
      assert.equal(status, scenario === 'statement-conflict' ? 422 : 503);
      assert.equal(body.code, scenario === 'statement-conflict' ? 'EDU_TASK_CONTRACT_INVALID' : 'EDU_TEST_GENERATION_FAILED');
      assert.doesNotMatch(body.message, /Invalid response structure/);
      assert.equal(saved.length, 0);
    }
    assert.ok(queries.length > 0);
  });
}
