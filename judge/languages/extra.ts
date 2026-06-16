import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LIMIT_PRESETS, LanguageAdapter } from "./types";

/** Build a single-file `writeSource` for the given filename. */
function singleFileWriter(filename: string) {
  return async (workDir: string, source: string): Promise<void> => {
    await writeFile(path.join(workDir, filename), source, { encoding: "utf8" });
  };
}

// D — default profile uses the reference DMD compiler (gdc is a version profile).
export const dLanguage: LanguageAdapter = {
  id: "d",
  entryFile: "main.d",
  defaultLimits: { ...LIMIT_PRESETS.native },
  compileTimeLimitMs: COMPILE_BUDGET.fast,
  writeSource: singleFileWriter("main.d"),
  getCompilePlan() {
    return {
      display: "dmd -O -release -of=app main.d",
      argv: ["/usr/bin/dmd", "-O", "-release", "-inline", "-of=app", "main.d"]
    };
  },
  getRunPlan() {
    return { display: "./app", argv: ["./app"] };
  }
};

// Dart — run via the JIT VM (no separate compile step). Caches under /work.
export const dartLanguage: LanguageAdapter = {
  id: "dart",
  entryFile: "main.dart",
  defaultLimits: { ...LIMIT_PRESETS.scripting },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.dart"),
  getCompilePlan() {
    return null;
  },
  getRunPlan() {
    return {
      display: "dart main.dart",
      argv: ["/usr/bin/env", "HOME=/work", "PUB_CACHE=/work/.pubcache", "/usr/bin/dart", "--disable-analytics", "main.dart"]
    };
  }
};

// Haskell — GHC produces a native binary.
export const haskellLanguage: LanguageAdapter = {
  id: "haskell",
  entryFile: "main.hs",
  defaultLimits: { ...LIMIT_PRESETS.native },
  compileTimeLimitMs: COMPILE_BUDGET.slow,
  writeSource: singleFileWriter("main.hs"),
  getCompilePlan() {
    return {
      display: "ghc -O main.hs -o app",
      argv: ["/usr/bin/ghc", "-O", "-outputdir", ".ghc", "main.hs", "-o", "app"]
    };
  },
  getRunPlan() {
    return { display: "./app", argv: ["./app"] };
  }
};

// Common Lisp — SBCL script mode. Cap the dynamic space to fit the memory limit.
export const lispLanguage: LanguageAdapter = {
  id: "lisp",
  entryFile: "main.lisp",
  defaultLimits: { time_limit_ms: 2000, memory_limit_mb: 384, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.lisp"),
  getCompilePlan() {
    return null;
  },
  getRunPlan() {
    return {
      display: "sbcl --script main.lisp",
      argv: ["/usr/bin/sbcl", "--dynamic-space-size", "300", "--non-interactive", "--script", "main.lisp"]
    };
  }
};

// Lua.
export const luaLanguage: LanguageAdapter = {
  id: "lua",
  entryFile: "main.lua",
  defaultLimits: { ...LIMIT_PRESETS.scripting },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.lua"),
  getCompilePlan() {
    return null;
  },
  getRunPlan() {
    return { display: "lua main.lua", argv: ["/usr/bin/lua", "main.lua"] };
  }
};

// Perl.
export const perlLanguage: LanguageAdapter = {
  id: "perl",
  entryFile: "main.pl",
  defaultLimits: { ...LIMIT_PRESETS.scripting },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.pl"),
  getCompilePlan() {
    // perl -c is a fast compile-time syntax check.
    return { display: "perl -c main.pl", argv: ["/usr/bin/perl", "-c", "main.pl"] };
  },
  getRunPlan() {
    return { display: "perl main.pl", argv: ["/usr/bin/perl", "main.pl"] };
  }
};

// PHP (CLI).
export const phpLanguage: LanguageAdapter = {
  id: "php",
  entryFile: "main.php",
  defaultLimits: { ...LIMIT_PRESETS.scripting },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.php"),
  getCompilePlan() {
    // php -l lints (syntax-checks) without executing.
    return { display: "php -l main.php", argv: ["/usr/bin/php", "-l", "main.php"] };
  },
  getRunPlan() {
    return {
      display: "php main.php",
      argv: ["/usr/bin/php", "-d", "display_errors=stderr", "-d", "memory_limit=256M", "main.php"]
    };
  }
};

// Ruby.
export const rubyLanguage: LanguageAdapter = {
  id: "ruby",
  entryFile: "main.rb",
  defaultLimits: { ...LIMIT_PRESETS.scripting },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  writeSource: singleFileWriter("main.rb"),
  getCompilePlan() {
    // ruby -c is a fast syntax check.
    return { display: "ruby -c main.rb", argv: ["/usr/bin/ruby", "-c", "main.rb"] };
  },
  getRunPlan() {
    return { display: "ruby main.rb", argv: ["/usr/bin/ruby", "main.rb"] };
  }
};

// Swift — swiftc produces a native binary. Keep module cache under /work.
export const swiftLanguage: LanguageAdapter = {
  id: "swift",
  entryFile: "main.swift",
  defaultLimits: { ...LIMIT_PRESETS.native },
  compileTimeLimitMs: COMPILE_BUDGET.slow,
  writeSource: singleFileWriter("main.swift"),
  getCompilePlan() {
    return {
      display: "swiftc -O main.swift -o app",
      argv: [
        "/usr/bin/env",
        "HOME=/work",
        "/usr/bin/swiftc",
        "-O",
        "-module-cache-path",
        "/work/.swift-cache",
        "main.swift",
        "-o",
        "app"
      ]
    };
  },
  getRunPlan() {
    return { display: "./app", argv: ["./app"] };
  }
};
