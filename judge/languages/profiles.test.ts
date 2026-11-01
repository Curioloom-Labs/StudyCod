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
  const tkinterArgv = tkinter.run().argv;
  assert.equal(tkinterArgv[0], "/bin/sh");
  assert.match(tkinterArgv[2], /Xvfb :99 .* -nolisten tcp -ac/);
  assert.match(tkinterArgv[2], /\/tmp\/\.X11-unix\/X99/);
  assert.ok(tkinterArgv.includes("-B"), "Tkinter execution must not write bytecode into the sandbox");
  assert.ok(!tkinterArgv.includes("/usr/bin/xvfb-run"), "nsjail-compatible launcher must not use xvfb-run's signal handshake");
});

test("runtime profiles cannot be selected for a different language family", () => {
  assert.throws(() => resolveProfile("python", "cpp20"), /does not belong to language/);
});
