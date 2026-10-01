import { test, describe } from "node:test";
import assert from "node:assert";

import { CloudflareAIProvider } from "./CloudflareAIProvider";

// Unit-level test: we don't call Cloudflare; we only verify prompt/schema shaping logic
// via a thin access to private helpers using bracket notation.

describe("CloudflareAIProvider prompt shaping", () => {
  test("provider response keeps significant stdin whitespace and rejects missing input", async () => {
    const p = new CloudflareAIProvider() as any;
    p.callCloudflareWorker = async () => ({ content: JSON.stringify({ tests: [{ input: '  text  ', output: 'text' }] }) });
    const params = { taskDescription: 'Read one line and print it.', taskTitle: 'Echo', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT' };
    const result = await p.generateTestDataWithAI(params);
    assert.equal(result[0].input, '  text  ');
    p.callCloudflareWorker = async () => ({ content: JSON.stringify({ tests: [{ input: '', output: 'text' }] }) });
    await assert.rejects(() => p.generateTestDataWithAI(params), /requires input/);
  });
  test("a single stdin test and the last statement rule survive prompt shaping", () => {
    const p = new CloudflareAIProvider() as any;
    const description = 'Read N and print N. ' + 'Context. '.repeat(1000) + '\nFINAL RULE: Preserve every output line.';
    const built = p.buildTestDataPrompt({ taskDescription: description, taskTitle: 'Echo', lang: 'PYTHON', count: 1 });
    assert.ok(built.prompt.includes(description));
    assert.ok(built.prompt.includes('IO TYPE: STDIN_STDOUT'));
    assert.equal(built.schema.properties.tests.minItems, 1);
  });
  test("buildTestDataPrompt produces schema with exact count", () => {
    const p = new CloudflareAIProvider() as any;
    const built = p.buildTestDataPrompt({
      taskDescription: "Read N and print N.",
      taskTitle: "Echo",
      lang: "JAVA",
      count: 5
    });

    assert.ok(built);
    assert.equal(typeof built.prompt, "string");
    assert.ok(built.prompt.includes("РІВНО 5"));
    assert.equal(typeof built.systemPrompt, "string");
    assert.equal(typeof built.schema, "object");
    assert.equal((built.schema as any).properties.tests.minItems, 5);
    assert.equal((built.schema as any).properties.tests.maxItems, 5);
    assert.match(built.systemPrompt, /всі рядки у визначеному порядку/);
    assert.match(built.prompt, /не пропускай рядок для нуля/);
    assert.match(built.prompt, /підстав input у формулу/);
  });
});
