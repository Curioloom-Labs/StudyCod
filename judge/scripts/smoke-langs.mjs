#!/usr/bin/env node
// Smoke-test every language/profile through the real judge worker (nsjail sandbox).
// Each program prints "ok"; checker is whitespace. Run AFTER `npm run build` in judge/.
//
//   node scripts/smoke-langs.mjs
//
// Env honoured: NSJAIL_PATH, NSJAIL_CONFIG, NSJAIL_USE_CONFIG (defaults to config-mode).
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.resolve(__dirname, "..", "dist", "index.js");

// language family + optional compiler profile + a minimal "print ok" program.
const CASES = [
  ["python", null, `print("ok")`],
  ["python", "pypy3", `print("ok")`],
  ["c", null, `#include <stdio.h>\nint main(){printf("ok");return 0;}`],
  ["cpp", null, `#include <iostream>\nint main(){std::cout<<"ok";return 0;}`],
  ["cpp", "cpp20", `#include <iostream>\nint main(){std::cout<<"ok";return 0;}`],
  ["java", null, `public class Main{public static void main(String[] a){System.out.print("ok");}}`],
  ["java", "java21", `public class Main{public static void main(String[] a){System.out.print("ok");}}`],
  ["kotlin", null, `fun main(){print("ok")}`],
  ["csharp", null, `System.Console.Write("ok");`],
  ["csharp", "csharp-mono", `class P{static void Main(){System.Console.Write("ok");}}`],
  ["js", null, `process.stdout.write("ok")`],
  ["go", null, `package main\nimport "fmt"\nfunc main(){fmt.Print("ok")}`],
  ["rust", null, `fn main(){print!("ok");}`],
  ["pascal", null, `begin write('ok') end.`],
  ["d", null, `import std.stdio; void main(){write("ok");}`],
  ["d", "d-gdc", `import std.stdio; void main(){write("ok");}`],
  ["dart", null, `void main(){print("ok");}`],
  ["haskell", null, `main = putStr "ok"`],
  ["lisp", null, `(princ "ok")`],
  ["lua", null, `io.write("ok")`],
  ["perl", null, `print "ok";`],
  ["php", null, `<?php echo "ok";`],
  ["ruby", null, `print "ok"`],
  ["swift", null, `print("ok")`],
];

function runOne(language, compiler, source) {
  return new Promise((resolve) => {
    const req = {
      submission_id: `smoke_${language}_${compiler || "default"}`,
      language,
      ...(compiler ? { compiler } : {}),
      source,
      tests: [{ id: 1, input: "", output: "ok" }],
      limits: { time_limit_ms: 5000, memory_limit_mb: 256, output_limit_kb: 64 },
      checker: { type: "whitespace" },
      debug: true,
      run_all: true,
    };
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "production",
      NSJAIL_USE_CONFIG: process.env.NSJAIL_USE_CONFIG || "1",
    };
    const child = spawn(process.execPath, [WORKER], { env });
    let out = "", err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("close", () => {
      let verdict, detail = "";
      try {
        const j = JSON.parse(out);
        if (j.error) { verdict = "ERR"; detail = j.error; }
        else {
          verdict = j.verdict;
          if (verdict === "CE") detail = (j.compile?.stderr || j.compile?.message || "").split("\n")[0];
          else if (verdict !== "AC") detail = (j.tests?.[0]?.message || j.tests?.[0]?.stderr || "").split("\n")[0];
        }
      } catch { verdict = "BADJSON"; detail = (out || err).slice(0, 200); }
      resolve({ verdict, detail });
    });
    child.stdin.end(JSON.stringify(req));
  });
}

const ok = [], bad = [];
for (const [language, compiler, source] of CASES) {
  const label = compiler ? `${language}/${compiler}` : language;
  const { verdict, detail } = await runOne(language, compiler, source);
  const mark = verdict === "AC" ? "✅" : "❌";
  (verdict === "AC" ? ok : bad).push(label);
  console.log(`${mark} ${label.padEnd(18)} ${verdict}${detail ? "  — " + detail : ""}`);
}
console.log(`\n${ok.length}/${CASES.length} AC` + (bad.length ? `; FAILED: ${bad.join(", ")}` : " — all green"));
process.exit(bad.length ? 1 : 0);
