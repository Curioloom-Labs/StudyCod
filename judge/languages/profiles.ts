import type { CompilePlan, LanguageId, RunPlan } from "./types";

/**
 * A selectable compiler/runtime "profile" — the user picks not just a language but a
 * specific toolchain/version (e.g. "PyPy 3.11", "OpenJDK 21", "g++ 20 with gmp"). Every
 * profile maps back to a base {@link LanguageId} family, which keeps the rest
 * of the judge (chroot, limits, stderr cleaning, entry-file conventions) unchanged.
 *
 * A profile whose `id` equals its `family` is the *default* for that family and provides no
 * `compile`/`run` override — it falls through to the family's LanguageAdapter, preserving
 * historical behaviour. Version profiles override the compile/run argv only.
 */
export interface CompilerProfile {
  /** Stable wire id selected by the client, e.g. "pypy3", "java21", "cpp20-gmp". */
  id: string;
  /** Base language family driving chroot/limits/stderr/entry conventions. */
  family: LanguageId;
  /** Human-readable label shown in pickers. */
  label: string;
  /** Override compile plan. When undefined, the family adapter's plan is used. */
  compile?: () => CompilePlan | null;
  /** Override run plan. When undefined, the family adapter's plan is used. */
  run?: () => RunPlan;
}

/** Read a binary/home path from env with a sane install-location fallback. */
function envPath(name: string, fallback: string): string {
  const v = (process.env[name] ?? "").trim();
  return v || fallback;
}

// ---- Java -------------------------------------------------------------------
function javaProfile(id: string, label: string, homeEnv: string, defaultHome: string): CompilerProfile {
  const home = () => envPath(homeEnv, defaultHome);
  return {
    id,
    family: "java",
    label,
    compile: () => ({
      display: `${home()}/bin/javac Main.java`,
      argv: [`${home()}/bin/javac`, "-J-Xms64m", "-J-Xmx128m", "-encoding", "UTF-8", "Main.java"]
    }),
    run: () => ({
      display: `${home()}/bin/java Main`,
      argv: [
        `${home()}/bin/java`,
        "-Xms64m",
        "-Xmx128m",
        "-XX:+UseSerialGC",
        "-Dfile.encoding=UTF-8",
        "-Dsun.stdout.encoding=UTF-8",
        "-Dsun.stderr.encoding=UTF-8",
        "-Duser.language=en",
        "-Duser.country=US",
        "-cp",
        ".",
        "Main"
      ]
    })
  };
}

// ---- C / C++ ----------------------------------------------------------------
function gppProfile(id: string, label: string, std: string, gmp = false): CompilerProfile {
  // GMP libraries must follow the objects on the link line.
  const gmpLibs = gmp ? ["-lgmpxx", "-lgmp"] : [];
  return {
    id,
    family: "cpp",
    label,
    compile: () => ({
      display: `g++ -B/usr/bin ${std} main.cpp -o app${gmp ? " -lgmpxx -lgmp" : ""}`,
      argv: ["/usr/bin/g++", "-B/usr/bin", "-O2", "-pipe", std, "-fno-omit-frame-pointer", "main.cpp", "-o", "app", ...gmpLibs]
    })
    // run inherits the family default (./app)
  };
}

function gccProfile(id: string, label: string, std: string): CompilerProfile {
  return {
    id,
    family: "c",
    label,
    compile: () => ({
      display: `gcc -B/usr/bin ${std} main.c -o app`,
      argv: ["/usr/bin/gcc", "-B/usr/bin", "-O2", "-pipe", std, "-fno-omit-frame-pointer", "main.c", "-o", "app"]
    })
  };
}

// ---- Python -----------------------------------------------------------------
function pypyProfile(id: string, label: string): CompilerProfile {
  const pypy = () => envPath("JUDGE_BIN_PYPY3", "/usr/bin/pypy3");
  return {
    id,
    family: "python",
    label,
    compile: () => ({ display: "pypy3 -m py_compile main.py", argv: [pypy(), "-B", "-m", "py_compile", "main.py"] }),
    run: () => ({ display: "pypy3 main.py", argv: [pypy(), "-B", "-u", "main.py"] })
  };
}

// ---- C# (Mono) --------------------------------------------------------------
const csharpMonoProfile: CompilerProfile = {
  id: "csharp-mono",
  family: "csharp",
  label: "C# (Mono)",
  // The family adapter still writes App.csproj + Program.cs; Mono just ignores the csproj.
  compile: () => ({
    display: "mcs -optimize+ -out:app.exe Program.cs",
    argv: [envPath("JUDGE_BIN_MCS", "/usr/bin/mcs"), "-optimize+", "-out:app.exe", "Program.cs"]
  }),
  run: () => ({
    display: "mono app.exe",
    argv: [envPath("JUDGE_BIN_MONO", "/usr/bin/mono"), "app.exe"]
  })
};

// ---- D (gdc) ----------------------------------------------------------------
const dGdcProfile: CompilerProfile = {
  id: "d-gdc",
  family: "d",
  label: "D (gdc)",
  compile: () => ({
    display: "gdc -O2 -frelease -o app main.d",
    argv: [envPath("JUDGE_BIN_GDC", "/usr/bin/gdc"), "-O2", "-frelease", "-o", "app", "main.d"]
  })
};

/**
 * Full catalogue of selectable compilers. Order matters: it's
 * the order shown to clients, and the FIRST profile for each family is that family's default
 * (must be the override-free `{ id: family }` entry).
 */
export const COMPILER_PROFILES: CompilerProfile[] = [
  // Python
  { id: "python", family: "python", label: "Python 3.14" },
  { id: "python-libs", family: "python", label: "Python 3.14 (with extra libs)" },
  pypyProfile("pypy3", "Python 3.11 (PyPy)"),
  pypyProfile("pypy3-libs", "Python 3.11 (PyPy with libs)"),

  // C
  { id: "c", family: "c", label: "C (gnu 11)" },
  gccProfile("c17", "C 17 (gnu 14)", "-std=gnu17"),
  gccProfile("c23", "C 23 (gnu 14)", "-std=gnu23"),

  // C++
  { id: "cpp", family: "cpp", label: "C++ 17 (gnu 14.2)" },
  gppProfile("cpp20", "C++ 20 (gnu 14.2)", "-std=gnu++20"),
  gppProfile("cpp20-gmp", "C++ 20 (gnu 14.2 with gmp)", "-std=gnu++20", true),
  gppProfile("cpp23", "C++ 23 (gnu 14.2)", "-std=gnu++23"),
  gppProfile("cpp23-gmp", "C++ 23 (gnu 14.2 with gmp)", "-std=gnu++23", true),

  // C#
  { id: "csharp", family: "csharp", label: "C# (.NET)" },
  csharpMonoProfile,

  // D
  { id: "d", family: "d", label: "D (dmd)" },
  dGdcProfile,

  // Dart / Go / Haskell
  { id: "dart", family: "dart", label: "Dart 3.6" },
  { id: "go", family: "go", label: "Go 1.24" },
  { id: "haskell", family: "haskell", label: "Haskell (ghc 8.8)" },

  // Java
  { id: "java", family: "java", label: "Java (OpenJDK, default)" },
  javaProfile("java17", "Java (openjdk 17)", "JUDGE_JAVA17_HOME", "/usr/lib/jvm/java-17-openjdk-amd64"),
  javaProfile("java21", "Java (openjdk 21)", "JUDGE_JAVA21_HOME", "/usr/lib/jvm/java-21-openjdk-amd64"),
  javaProfile("java25", "Java (openjdk 25)", "JUDGE_JAVA25_HOME", "/usr/lib/jvm/java-25-openjdk-amd64"),

  // JavaScript / Kotlin / Lisp / Lua
  { id: "js", family: "js", label: "JavaScript (node 18)" },
  { id: "kotlin", family: "kotlin", label: "Kotlin 1.9" },
  { id: "lisp", family: "lisp", label: "Common Lisp (SBCL 2.4)" },
  { id: "lua", family: "lua", label: "Lua 5.1" },

  // Pascal / Perl / PHP
  { id: "pascal", family: "pascal", label: "Pascal (fpc 3.2)" },
  { id: "perl", family: "perl", label: "Perl 5.32" },
  { id: "php", family: "php", label: "PHP 7.4" },

  // Ruby / Rust / Swift
  { id: "ruby", family: "ruby", label: "Ruby 2.4" },
  { id: "rust", family: "rust", label: "Rust 1.78" },
  { id: "swift", family: "swift", label: "Swift 5.6" }
];

const PROFILE_BY_ID = new Map<string, CompilerProfile>(COMPILER_PROFILES.map(p => [p.id, p]));

/** Default profile id for a family (the first catalogue entry for that family). */
export function defaultProfileIdForFamily(family: LanguageId): string {
  const p = COMPILER_PROFILES.find(x => x.family === family);
  return p ? p.id : family;
}

/**
 * Resolve the profile to execute. `compiler` is the optional client-selected id; when absent
 * or empty, we fall back to the family's default profile (current behaviour). Throws if
 * `compiler` is given but unknown, or belongs to a different family than `language`.
 */
export function resolveProfile(family: LanguageId, compiler?: string | null): CompilerProfile {
  const id = (compiler ?? "").trim();
  if (!id) {
    return PROFILE_BY_ID.get(defaultProfileIdForFamily(family))!;
  }
  const profile = PROFILE_BY_ID.get(id);
  if (!profile) {
    throw new Error(`INVALID_REQUEST: unknown compiler '${id}'`);
  }
  if (profile.family !== family) {
    throw new Error(`INVALID_REQUEST: compiler '${id}' does not belong to language '${family}'`);
  }
  return profile;
}

/** Lightweight catalogue for clients (id + label + family), no functions. */
export function listCompilerProfiles(): Array<{ id: string; family: LanguageId; label: string }> {
  return COMPILER_PROFILES.map(({ id, family, label }) => ({ id, family, label }));
}
