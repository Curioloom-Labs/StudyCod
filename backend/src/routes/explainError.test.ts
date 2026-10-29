import test from "node:test";
import assert from "node:assert/strict";
import tasksRouter from "./tasks";
import { getLLMProvider, setLLMProvider } from "../services/llm/provider";

test("explain-error follows UI headers independently of the programming language", async (t) => {
  const original = getLLMProvider();
  t.after(() => setLLMProvider(original));
  setLLMProvider({
    async generateText() { throw new Error("Unexpected text generation"); },
    async generateJSON<T>(): Promise<T> { throw new Error("Simulated outage"); },
  });
  const route = tasksRouter.stack.find((entry: any) =>
    entry.route?.path === "/explain-error" && entry.route.methods.post) as any;
  assert.ok(route);
  for (const [headers, expected] of [
    [{ "x-ui-language": "en", "accept-language": "uk" }, /did not compile/],
    [{ "x-ui-language": "uk", "accept-language": "en" }, /не скомпілювалася/],
    [{ "accept-language": "en-US" }, /did not compile/],
    [{}, /не скомпілювалася/],
  ] as const) {
    let body: any;
    let status = 200;
    const response = {
      status(value: number) { status = value; return response; },
      json(value: unknown) { body = value; return response; },
    };
    await route.route.stack.at(-1).handle({
      body: { language: "JAVA", code: "class Main {", verdict: "CE" },
      query: {}, headers,
    }, response);
    assert.equal(status, 200);
    assert.equal(body.source, "deterministic");
    assert.match(body.explanation, expected);
  }
});
