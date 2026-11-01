import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfile } from "./profiles";

test("Python scientific and Tkinter compiler profiles are registered for reference execution", () => {
  const scientific = resolveProfile("python", "python-libs");
  assert.equal(scientific.id, "python-libs");
  assert.deepEqual(scientific.run?.().argv, ["/usr/bin/python3", "-B", "-u", "main.py"]);

  const tkinter = resolveProfile("python", "python-gui");
  assert.equal(tkinter.id, "python-gui");
  assert.ok(tkinter.run);
  assert.deepEqual(tkinter.run().argv.slice(0, 3), ["/usr/bin/xvfb-run", "-a", "-s"]);
  assert.ok(tkinter.run().argv.includes("-B"), "Tkinter execution must not write bytecode into the sandbox");
});

test("runtime profiles cannot be selected for a different language family", () => {
  assert.throws(() => resolveProfile("python", "cpp20"), /does not belong to language/);
});
