import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../../env";
import { translateMarkdownBetweenLanguages } from "./translateUkToEn";
import {
  localizeTaskStatement,
  detectStatementLanguage,
} from "./taskStatementLocalization";

const ukrainian = "Обчисліть суму чисел";
const english = "Calculate the sum of numbers";

test("statement localization translates prose in both directions and preserves samples, code, math and URLs", async (t) => {
  const oldUrl = env.__translateUkEnUrl;
  const oldFallback = env.__translateAllowPublicFallback;
  env.__translateUkEnUrl = "https://translation.invalid/translate";
  env.__translateAllowPublicFallback = false;
  t.after(() => {
    env.__translateUkEnUrl = oldUrl;
    env.__translateAllowPublicFallback = oldFallback;
  });
  const requests: Array<{ source: string; target: string; q: string }> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      const translatedText = body.q
        .replaceAll(ukrainian, english)
        .replaceAll("Приклад", "Example");
      const result =
        body.target === "uk"
          ? translatedText
              .replaceAll(english, ukrainian)
              .replaceAll("Example", "Приклад")
          : translatedText;
      return new Response(JSON.stringify({ translatedText: result }), {
        headers: { "content-type": "application/json" },
      });
    },
  );
  const protectedPart =
    "\n\n```text\n5\n12 7 7 18 9\n```\n\n<pre>YES\nNO `keep`</pre>\n\n`print(1)` $n + m$ https://example.test/task?q=1 [ref](https://example.test/docs)";
  const input = ukrainian + protectedPart;
  const translated = await translateMarkdownBetweenLanguages(input, "uk", "en");
  assert.equal(translated, english + protectedPart);
  assert.equal(
    await translateMarkdownBetweenLanguages(translated, "en", "uk"),
    input,
  );
  assert.equal(detectStatementLanguage(translated), "en");
  assert(requests.some((r) => r.source === "uk" && r.target === "en"));
  assert(requests.some((r) => r.source === "en" && r.target === "uk"));
  const task = { id: 91001, title: ukrainian, description: input };
  const before = requests.length;
  const [first, second] = await Promise.all([
    localizeTaskStatement(task, "en"),
    localizeTaskStatement(task, "en"),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.language, "en");
  assert.equal(first.description, english + protectedPart);
  assert.equal(
    requests.length - before,
    2,
    "concurrent readers share one translation",
  );
  await localizeTaskStatement(task, "en");
  assert.equal(requests.length - before, 2, "translated statement is cached");
  await localizeTaskStatement(
    { ...task, description: input + "\n" + ukrainian },
    "en",
  );
  assert.equal(
    requests.length - before,
    4,
    "source changes invalidate the cache",
  );
});

test("an unavailable translator serves the original statement with its real language", async (t) => {
  const oldUrl = env.__translateUkEnUrl;
  const oldFallback = env.__translateAllowPublicFallback;
  env.__translateUkEnUrl = "";
  env.__translateAllowPublicFallback = false;
  t.after(() => {
    env.__translateUkEnUrl = oldUrl;
    env.__translateAllowPublicFallback = oldFallback;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  const task = { id: 91002, title: ukrainian, description: ukrainian };
  assert.deepEqual(await localizeTaskStatement(task, "en"), {
    title: task.title,
    description: task.description,
    language: "uk",
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test("a provider that corrupts protected tokens cannot change task samples", async (t) => {
  const oldUrl = env.__translateUkEnUrl;
  const oldFallback = env.__translateAllowPublicFallback;
  env.__translateUkEnUrl = "https://translation.invalid/translate";
  env.__translateAllowPublicFallback = false;
  t.after(() => {
    env.__translateUkEnUrl = oldUrl;
    env.__translateAllowPublicFallback = oldFallback;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ translatedText: english }), {
        headers: { "content-type": "application/json" },
      }),
  );
  const task = {
    id: 91003,
    title: ukrainian,
    description: ukrainian + "\n\n```text\nYES\n```",
  };
  assert.deepEqual(await localizeTaskStatement(task, "en"), {
    title: task.title,
    description: task.description,
    language: "uk",
  });
});
