import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { jsLanguage } from "./js";

for (const [name, source] of [
  ["ordinary fs stdin remains available", 'console.log(Number(require("fs").readFileSync(0,"utf8"))*2)'],
  ["readline and print helpers remain available", 'print(Number(readline())*2)'],
]) {
  test(name, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "judge-js-test-"));
    try {
      await jsLanguage.writeSource(dir, source);
      const result = spawnSync(process.execPath, ["--require", path.join(dir, "studycod-io.cjs"), path.join(dir, "main.js")], { input: "21\n", encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), "42");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
