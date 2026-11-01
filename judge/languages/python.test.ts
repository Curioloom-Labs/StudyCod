import assert from "node:assert/strict";
import test from "node:test";
import { pythonCompilePlanForFiles } from "./python";

test("multi-file Python syntax checks do not write bytecode into sandbox source directories", () => {
  const plan = pythonCompilePlanForFiles(["main.py", "student/main.py", "student/helper.py", "README.md"]);

  assert.ok(plan);
  assert.deepEqual(plan.argv.slice(0, 3), ["/usr/bin/python3", "-B", "-c"]);
  assert.match(plan.argv[3], /compile\(pathlib\.Path\(p\)\.read_bytes\(\), p, 'exec'\)/);
  assert.doesNotMatch(plan.argv[3], /py_compile/);
  assert.deepEqual(plan.argv.slice(4), ["main.py", "student/main.py", "student/helper.py"]);
});

test("multi-file Python submissions without Python source skip the syntax check", () => {
  assert.equal(pythonCompilePlanForFiles(["README.md", "image.png"]), null);
});
