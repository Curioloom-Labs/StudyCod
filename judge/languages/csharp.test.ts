import test from "node:test";
import assert from "node:assert/strict";
import { csharpLanguage, csharpMsBuildPlan } from "./csharp";

test("C# trusted direct compiler is opt-in and multi-file SDK plan remains available", () => {
  const saved = process.env.JUDGE_CSHARP_COMPILER_WRAPPER;
  try {
    delete process.env.JUDGE_CSHARP_COMPILER_WRAPPER;
    assert.ok(csharpLanguage.getCompilePlan()?.argv.includes("build"));
    process.env.JUDGE_CSHARP_COMPILER_WRAPPER = "/usr/local/lib/studycod/csharp-build/compile";
    assert.deepEqual(csharpLanguage.getCompilePlan()?.argv, ["/bin/sh", process.env.JUDGE_CSHARP_COMPILER_WRAPPER]);
    assert.ok(csharpMsBuildPlan().argv.includes("build"));
    assert.deepEqual(csharpLanguage.getRunPlan().argv.slice(-1), ["bin/Release/net8.0/App.dll"]);
  } finally {
    if (saved === undefined) delete process.env.JUDGE_CSHARP_COMPILER_WRAPPER;
    else process.env.JUDGE_CSHARP_COMPILER_WRAPPER = saved;
  }
});
