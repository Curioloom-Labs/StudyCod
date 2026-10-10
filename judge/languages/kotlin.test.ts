import test from "node:test";
import assert from "node:assert/strict";
import { kotlinCompileArgv } from "./kotlin";

test("Kotlin direct launch preserves the 1.9 compiler, files and runtime packaging", () => {
  const saved = process.env.JUDGE_KOTLIN_COMPILER_JAR;
  try {
    process.env.JUDGE_KOTLIN_COMPILER_JAR = "/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar";
    const args = kotlinCompileArgv(["Main.kt", "Helper.kt"]);
    assert.ok(args.includes("org.jetbrains.kotlin.cli.jvm.K2JVMCompiler"));
    assert.ok(args.includes("-Dkotlin.home=/opt/kotlinc/kotlinc"));
    assert.deepEqual(args.slice(-5), ["Main.kt", "Helper.kt", "-include-runtime", "-d", "app.jar"]);
    assert.ok(!args.includes("-Xuse-k2"));
    assert.ok(!args.includes("-language-version"));
  } finally {
    if (saved === undefined) delete process.env.JUDGE_KOTLIN_COMPILER_JAR;
    else process.env.JUDGE_KOTLIN_COMPILER_JAR = saved;
  }
});

test("Kotlin without a configured compiler jar retains kotlinc launcher", () => {
  const saved = process.env.JUDGE_KOTLIN_COMPILER_JAR;
  try {
    delete process.env.JUDGE_KOTLIN_COMPILER_JAR;
    assert.ok(kotlinCompileArgv(["Main.kt"]).includes("/usr/bin/kotlinc"));
  } finally {
    if (saved !== undefined) process.env.JUDGE_KOTLIN_COMPILER_JAR = saved;
  }
});
