import { test, describe } from "node:test";
import assert from "node:assert";

import { CloudflareAIProvider } from "./CloudflareAIProvider";

// Unit-level test: we don't call Cloudflare; we only verify prompt/schema shaping logic
// via a thin access to private helpers using bracket notation.

describe("CloudflareAIProvider prompt shaping", () => {
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
  });
});
