// Single source of truth for the judge language families supported by the platform.
// Keep in sync with the backend judge (judge/languages/registry.ts and
// backend/src/services/judgeWorker/types.ts). All families are offered everywhere
// (library, contests, playground) — there is no per-task language restriction.

export const JUDGE_LANGUAGES = [
  "java",
  "python",
  "cpp",
  "c",
  "csharp",
  "kotlin",
  "js",
  "go",
  "rust",
  "pascal",
  "d",
  "dart",
  "haskell",
  "lisp",
  "lua",
  "perl",
  "php",
  "ruby",
  "swift",
] as const;

export type JudgeLanguage = (typeof JUDGE_LANGUAGES)[number];

export const JUDGE_LANGUAGE_LABELS: Record<JudgeLanguage, string> = {
  java: "Java",
  python: "Python",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  kotlin: "Kotlin",
  js: "JavaScript",
  go: "Go",
  rust: "Rust",
  pascal: "Pascal",
  d: "D",
  dart: "Dart",
  haskell: "Haskell",
  lisp: "Common Lisp",
  lua: "Lua",
  perl: "Perl",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift",
};

export const JUDGE_ENTRY_FILES: Record<JudgeLanguage, string> = {
  java: "Main.java",
  python: "main.py",
  cpp: "main.cpp",
  c: "main.c",
  csharp: "Program.cs",
  kotlin: "Main.kt",
  js: "main.js",
  go: "main.go",
  rust: "main.rs",
  pascal: "main.pas",
  d: "main.d",
  dart: "main.dart",
  haskell: "main.hs",
  lisp: "main.lisp",
  lua: "main.lua",
  perl: "main.pl",
  php: "main.php",
  ruby: "main.rb",
  swift: "main.swift",
};

export const JUDGE_FILE_EXTENSIONS: Record<JudgeLanguage, string> = {
  java: "java", python: "py", cpp: "cpp", c: "c", csharp: "cs", kotlin: "kt", js: "js",
  go: "go", rust: "rs", pascal: "pas", d: "d", dart: "dart", haskell: "hs", lisp: "lisp",
  lua: "lua", perl: "pl", php: "php", ruby: "rb", swift: "swift",
};

/** Small, valid starting points used when a task has no template for the selected language. */
export const JUDGE_STARTER_TEMPLATES: Record<JudgeLanguage, string> = {
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: solve the problem\n    }\n}\n",
  python: "import sys\n\ndata = sys.stdin.read().split()\n# TODO: solve the problem\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // TODO: solve the problem\n    return 0;\n}\n",
  c: "#include <stdio.h>\n\nint main(void) {\n    // TODO: solve the problem\n    return 0;\n}\n",
  csharp: "using System;\n\nclass Program {\n    static void Main() {\n        // TODO: solve the problem\n    }\n}\n",
  kotlin: "fun main() {\n    // TODO: solve the problem\n}\n",
  js: "const fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n// TODO: solve the problem\n",
  go: "package main\n\nimport (\n    \"bufio\"\n    \"os\"\n)\n\nfunc main() {\n    in := bufio.NewReader(os.Stdin)\n    _ = in\n    // TODO: solve the problem\n}\n",
  rust: "use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // TODO: solve the problem\n}\n",
  pascal: "program Main;\nbegin\n  { TODO: solve the problem }\nend.\n",
  d: "import std.stdio;\n\nvoid main() {\n    // TODO: solve the problem\n}\n",
  dart: "import 'dart:io';\n\nvoid main() {\n  final input = stdin.readLineSync() ?? '';\n  // TODO: solve the problem\n}\n",
  haskell: "main :: IO ()\nmain = do\n  input <- getContents\n  -- TODO: solve the problem\n  pure ()\n",
  lisp: ";; TODO: solve the problem\n(let ((line (read-line *standard-input* nil)))\n  (when line (write-line line)))\n",
  lua: "local input = io.read('*a')\n-- TODO: solve the problem\nio.write(input)\n",
  perl: "use strict;\nuse warnings;\n\nmy $input = do { local $/; <STDIN> };\n# TODO: solve the problem\n",
  php: "<?php\n$input = stream_get_contents(STDIN);\n// TODO: solve the problem\n",
  ruby: "input = STDIN.read\n# TODO: solve the problem\n",
  swift: "import Foundation\n\nlet input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? \"\"\n// TODO: solve the problem\n",
};

export function templateForJudgeLanguage(
  language: JudgeLanguage,
  options: { templatesByLanguage?: Record<string, string> | null; fallback?: string | null; fallbackLanguage?: JudgeLanguage | null },
): string {
  const specific = options.templatesByLanguage?.[language];
  if (typeof specific === "string" && specific.trim()) return specific;
  const fallback = String(options.fallback ?? "");
  if (fallback.trim() && options.fallbackLanguage === language) return fallback;
  return JUDGE_STARTER_TEMPLATES[language];
}

/** Monaco editor language id for a judge family. */
export const JUDGE_MONACO_LANG: Record<JudgeLanguage, string> = {
  java: "java",
  python: "python",
  cpp: "cpp",
  c: "c",
  csharp: "csharp",
  kotlin: "kotlin",
  js: "javascript",
  go: "go",
  rust: "rust",
  pascal: "pascal",
  d: "d",
  dart: "dart",
  haskell: "haskell",
  lisp: "lisp",
  lua: "lua",
  perl: "perl",
  php: "php",
  ruby: "ruby",
  swift: "swift",
};

/** Parse a comma/space separated env list into a set of valid disabled languages. */
export function parseDisabledJudgeLanguages(raw: string | undefined): Set<JudgeLanguage> {
  const out = new Set<JudgeLanguage>();
  const s = String(raw ?? "").trim();
  if (!s) return out;
  for (const p of s.split(/[,\s]+/g).map(x => x.trim().toLowerCase()).filter(Boolean)) {
    if ((JUDGE_LANGUAGES as readonly string[]).includes(p)) out.add(p as JudgeLanguage);
  }
  return out;
}

/** All languages enabled for selection (full set minus any globally disabled via env). */
export function enabledJudgeLanguages(): JudgeLanguage[] {
  const disabled = parseDisabledJudgeLanguages(import.meta.env.VITE_JUDGE_DISABLED_LANGUAGES as string | undefined);
  const list = JUDGE_LANGUAGES.filter(l => !disabled.has(l));
  return list.length ? [...list] : [...JUDGE_LANGUAGES];
}

// ---- Compiler/version profiles ---------------------------------------------
// A "compiler" selects a specific toolchain/version within a family (e.g. PyPy vs CPython,
// OpenJDK 17/21/25, g++17/20/23). Mirrors backend COMPILER_CATALOGUE and the judge's
// profiles.ts — kept in sync manually (also exposed at GET /api/playground/compilers).
// The FIRST profile per family is that family's default.

export interface CompilerProfile {
  id: string;
  family: JudgeLanguage;
  label: string;
}

export const COMPILER_PROFILES: readonly CompilerProfile[] = [
  { id: "python", family: "python", label: "Python 3.14" },
  { id: "python-libs", family: "python", label: "Python 3.14 (with extra libs)" },
  { id: "pypy3", family: "python", label: "Python 3.11 (PyPy)" },
  { id: "pypy3-libs", family: "python", label: "Python 3.11 (PyPy with libs)" },
  { id: "c", family: "c", label: "C (gnu 11)" },
  { id: "c17", family: "c", label: "C 17 (gnu 14)" },
  { id: "c23", family: "c", label: "C 23 (gnu 14)" },
  { id: "cpp", family: "cpp", label: "C++ 17 (gnu 14.2)" },
  { id: "cpp20", family: "cpp", label: "C++ 20 (gnu 14.2)" },
  { id: "cpp20-gmp", family: "cpp", label: "C++ 20 (gnu 14.2 with gmp)" },
  { id: "cpp23", family: "cpp", label: "C++ 23 (gnu 14.2)" },
  { id: "cpp23-gmp", family: "cpp", label: "C++ 23 (gnu 14.2 with gmp)" },
  { id: "csharp", family: "csharp", label: "C# (.NET)" },
  { id: "csharp-mono", family: "csharp", label: "C# (Mono)" },
  { id: "d", family: "d", label: "D (dmd)" },
  { id: "d-gdc", family: "d", label: "D (gdc)" },
  { id: "dart", family: "dart", label: "Dart 3.6" },
  { id: "go", family: "go", label: "Go 1.24" },
  { id: "haskell", family: "haskell", label: "Haskell (ghc 8.8)" },
  { id: "java", family: "java", label: "Java (OpenJDK, default)" },
  { id: "java17", family: "java", label: "Java (openjdk 17)" },
  { id: "java21", family: "java", label: "Java (openjdk 21)" },
  { id: "java25", family: "java", label: "Java (openjdk 25)" },
  { id: "js", family: "js", label: "JavaScript (node 18)" },
  { id: "kotlin", family: "kotlin", label: "Kotlin 1.9" },
  { id: "lisp", family: "lisp", label: "Common Lisp (SBCL 2.4)" },
  { id: "lua", family: "lua", label: "Lua 5.1" },
  { id: "pascal", family: "pascal", label: "Pascal (fpc 3.2)" },
  { id: "perl", family: "perl", label: "Perl 5.32" },
  { id: "php", family: "php", label: "PHP 7.4" },
  { id: "ruby", family: "ruby", label: "Ruby 2.4" },
  { id: "rust", family: "rust", label: "Rust 1.78" },
  { id: "swift", family: "swift", label: "Swift 5.6" },
];

/** Compiler profiles available for a family, in display order. */
export function compilersForFamily(family: JudgeLanguage): CompilerProfile[] {
  return COMPILER_PROFILES.filter(p => p.family === family);
}

/** Default compiler id for a family (the first catalogue entry). */
export function defaultCompilerForFamily(family: JudgeLanguage): string {
  const first = COMPILER_PROFILES.find(p => p.family === family);
  return first ? first.id : family;
}

/** Validate that a compiler id belongs to the given family; else return the family default. */
export function resolveCompilerForFamily(family: JudgeLanguage, compiler: string | null | undefined): string {
  const id = String(compiler ?? "").trim();
  if (id && COMPILER_PROFILES.some(p => p.family === family && p.id === id)) return id;
  return defaultCompilerForFamily(family);
}
