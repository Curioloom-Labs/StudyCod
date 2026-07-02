import { env } from "../env";
import { judgeWithSemaphore } from "./judgeWorker";
import type { JudgeLanguage, JudgeRequest, JudgeResponse, CheckerSpec } from "./judgeWorker/types";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";

function truncateText(s: string, max: number): string {
  const v = String(s ?? "");
  if (v.length <= max) return v;
  return v.slice(0, max);
}

function judgeUnavailable(err: unknown): HttpError {
  const msg = err instanceof Error ? err.message : String(err);
  // Some failures are request-size / validation issues. Those should not be surfaced as 503.
  const tooLarge =
    /INPUT_TOO_LARGE/i.test(msg) ||
    /INVALID_REQUEST: (source too large|files too large|too many tests|test\.input too large|test\.output too large|too many files)/i.test(msg) ||
    /JUDGE_(STDOUT|STDERR)_TOO_LARGE/i.test(msg);
  if (tooLarge) {
    return new HttpError(413, "JUDGE_REQUEST_TOO_LARGE", {
      code: "JUDGE_REQUEST_TOO_LARGE",
      details: truncateText(msg, 2000),
      expose: true,
      cause: err
    });
  }
  return new HttpError(503, "Judge unavailable", {
    code: "JUDGE_UNAVAILABLE",
    details: env.__isProduction ? undefined : truncateText(msg, 2000),
    expose: true,
    cause: err
  });
}
export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  /** Wall time of the run in ms (from the judge), when available. */
  timeMs?: number | null;
  /** Peak memory in KB (from the judge cgroup), when available. */
  memoryKb?: number | null;
}

export interface CompilerProfileInfo {
  /** Wire id passed as `compiler`, e.g. "pypy3", "java21". */
  id: string;
  /** Base judge language family. */
  family: JudgeLanguage;
  /** Human-readable label for pickers. */
  label: string;
}

/**
 * Catalogue of selectable compilers/versions, mirroring judge/languages/profiles.ts.
 * The first entry per family is that family's default. Kept in sync manually because the
 * judge runs as a separate package/process.
 */
export const COMPILER_CATALOGUE: readonly CompilerProfileInfo[] = [
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
  { id: "swift", family: "swift", label: "Swift 5.6" }
];

export type ExecuteCodeMode = "auto" | "judge";

/**
 * Languages accepted by {@link executeCodeWithInput}. The legacy uppercase trio
 * (JAVA/PYTHON/CPP) is kept for backwards-compatibility with older callers; new code
 * may pass any lower-case judge family directly.
 */
export type ExecLanguage = "JAVA" | "PYTHON" | "CPP" | JudgeLanguage;

export interface ExecuteCodeOptions {
  /**
   * Legacy option kept for backwards-compatibility.
   * Execution is always routed through the judge sandbox.
   */
  mode?: ExecuteCodeMode;
  /**
   * Optional compiler/version selector (e.g. "pypy3", "java21", "cpp20").
   * Must belong to the resolved language family. When omitted, the family default is used.
   */
  compiler?: string;
}

function mapToJudgeLanguage(lang: ExecLanguage): JudgeLanguage {
  switch (lang) {
    case "JAVA":
      return "java";
    case "PYTHON":
      return "python";
    case "CPP":
      return "cpp";
    default:
      return lang;
  }
}

async function executeViaJudge(code: string, language: ExecLanguage, input: string, timeout: number, compiler?: string): Promise<CodeExecutionResult> {
  const judgeLang = mapToJudgeLanguage(language);
  const req: JudgeRequest = {
    submission_id: `exec_${judgeLang}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    language: judgeLang,
    ...(compiler ? { compiler } : {}),
    source: code,
    tests: [
      {
        id: 1,
        input: input ?? "",
        // We don't know the expected output here; use empty string and rely on debug output.
        output: "",
        hidden: false,
        group: "exec",
        weight: 1
      }
    ],
    limits: {
      time_limit_ms: Math.max(200, timeout),
      memory_limit_mb: judgeLang === "python" ? 256 : 384,
      output_limit_kb: 256
    },
    checker: { type: "exact" },
    debug: true,
    run_all: true,
    rerun_failed_once: false
  };

  let res: JudgeResponse;
  try {
    res = await judgeWithSemaphore(req);
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw judgeUnavailable(e);
  }
  if (res.verdict === "CE" && res.compile) {
    const combined = [res.compile.stderr, res.compile.stdout].filter(Boolean).join("\n").trim();
    return { stdout: "", stderr: combined || "Compilation error", exitCode: 1, success: false, timeMs: res.compile.time_ms ?? null, memoryKb: res.compile.memory_kb ?? null };
  }
  const t0: any = res.tests?.[0];
  const stdout = String(t0?.actual ?? "");
  const stderr = String(t0?.stderr ?? "");
  const verdict = String(t0?.verdict ?? "");
  // Treat WA as success: the program ran, output just doesn't match expected (we used empty expected).
  const success = verdict === "AC" || verdict === "WA";
  const exitCode = success ? 0 : 1;
  const timeMs = Number.isFinite(t0?.time_ms) ? Number(t0.time_ms) : (Number.isFinite(res.time_ms) ? Number(res.time_ms) : null);
  const memoryKb = Number.isFinite(t0?.memory_kb) ? Number(t0.memory_kb) : (Number.isFinite(res.memory_kb) ? Number(res.memory_kb) : null);
  return { stdout, stderr, exitCode, success, timeMs, memoryKb };
}

export async function executeCodeWithInput(
  code: string,
  language: ExecLanguage,
  input: string,
  timeout: number = 10000,
  options: ExecuteCodeOptions = {}
): Promise<CodeExecutionResult> {
  // Backwards compatibility: "auto" and "judge" both mean judge-only.
  // Any host/local execution path has been intentionally removed.
  const mode: ExecuteCodeMode = options.mode ?? "auto";
  if (mode !== "auto" && mode !== "judge") {
    throw new HttpError(400, "INVALID_EXECUTION_MODE", {
      code: "INVALID_EXECUTION_MODE",
      expose: true
    });
  }
  try {
    return await executeViaJudge(code, language, input, timeout, options.compiler);
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("executeCodeWithInput judge failed", { language, timeout, err: msg });
    throw judgeUnavailable(e);
  }
}
export function filterStderr(stderr: string, language?: "JAVA" | "PYTHON"): string {
  return filterStderrWithLanguage(stderr, language);
}

function filterStderrWithLanguage(stderr: string, language?: "JAVA" | "PYTHON"): string {
  if (!stderr) return "";
  const raw = String(stderr);

  const cleaned = raw
    .split("\n")
    .map(l => l.replace(/\r$/, ""))
    .filter(line => !line.includes("Picked up JAVA_TOOL_OPTIONS"))
    .filter(line => !line.includes("Picked up _JAVA_OPTIONS"))
    .filter(line => !line.includes("WARNING: An illegal reflective access operation has occurred"))
    .join("\n")
    .trim();

  if (!language) return cleaned;

  const explanation = explainFallbackError(language, cleaned);
  if (!explanation) return cleaned;

  const merged = cleaned.startsWith(explanation) ? cleaned : `${explanation}\n\n---\n${cleaned}`;
  return merged.trim();
}

function explainFallbackError(language: "JAVA" | "PYTHON", stderr: string): string | null {
  const s = String(stderr ?? "").trim();
  if (!s) return null;
  const lines = s.split(/\r?\n/);
  const last = [...lines].reverse().find(l => l.trim())?.trim() ?? "";

  if (language === "PYTHON") {
    const fileLine = lines.find(l => /File\s+".*"\s*,\s*line\s+\d+/.test(l));
    const mLine = fileLine?.match(/line\s+(\d+)/);
    const lineNo = mLine ? parseInt(mLine[1], 10) : NaN;
    const loc = Number.isFinite(lineNo) ? ` (рядок ${lineNo})` : "";

    if (/\bIndentationError\b/.test(last) || /\bTabError\b/.test(last)) {
      return `Помилка відступів (IndentationError)${loc}\nПоради:\n- Перевірте пробіли/таби на початку рядків\n- Використовуйте один стиль (краще 4 пробіли)`;
    }
    if (/\bSyntaxError\b/.test(last)) {
      return `Синтаксична помилка (SyntaxError)${loc}\nПоради:\n- Перевірте дужки і двокрапки після if/for/while/def\n- Переконайтеся, що лапки закриті`;
    }
    if (/^NameError\b/.test(last)) {
      return `Невідома змінна/ім'я (NameError)${loc}\nПоради:\n- Перевірте, чи змінна оголошена до використання\n- Перевірте опечатки у назві`;
    }
    if (/^IndexError\b/.test(last)) {
      return `Вихід за межі індексу (IndexError)${loc}\nПоради:\n- Перевірте межі циклів і len(...)\n- Пам'ятайте: останній індекс = len(x)-1`;
    }
    if (/^KeyError\b/.test(last)) {
      return `Немає ключа в словнику (KeyError)${loc}\nПоради:\n- Перевірте, чи ключ існує\n- Використовуйте d.get(key, default) або if key in d`;
    }
    if (/^ZeroDivisionError\b/.test(last)) {
      return `Ділення на нуль (ZeroDivisionError)${loc}\nПоради:\n- Перевіряйте знаменник перед діленням`;
    }
    return null;
  }

  // JAVA
  const joined = lines.join("\n");
  const m = joined.match(/Exception in thread "main" ([a-zA-Z0-9_$.]+)(?::\s*(.*))?/);
  const exc = m?.[1] ?? "";
  const msg = (m?.[2] ?? "").trim();
  const locM = joined.match(/\((?:Main|Solution)\.java:(\d+)\)/);
  const lineNo = locM ? parseInt(locM[1], 10) : NaN;
  const loc = Number.isFinite(lineNo) ? ` (рядок ${lineNo})` : "";

  if (exc.includes("NullPointerException")) {
    return `NullPointerException: звернення до null${loc}\nПоради:\n- Перевірте ініціалізацію об'єктів/масивів\n- Додайте перевірку на null перед викликом методів`;
  }
  if (exc.includes("ArrayIndexOutOfBoundsException")) {
    return `ArrayIndexOutOfBoundsException: вихід за межі масиву${loc}\nПоради:\n- Перевірте межі циклів\n- Останній індекс = length-1`;
  }
  if (exc.includes("NumberFormatException")) {
    return `NumberFormatException: не вдалося перетворити в число${loc}\nПоради:\n- Перевірте формат вводу${msg ? `\n- Повідомлення: ${msg}` : ""}`.trim();
  }
  if (exc.includes("StackOverflowError")) {
    return `StackOverflowError: переповнення стеку${loc}\nПоради:\n- Ймовірно нескінченна/дуже глибока рекурсія\n- Перевірте базовий випадок`;
  }

  return null;
}

// Backward-compatible named export used by routes.
export function filterStderrWithLang(stderr: string, language?: "JAVA" | "PYTHON"): string {
  return filterStderrWithLanguage(stderr, language);
}
export type OutputCompareMode = "lenient" | "exact" | "whitespace" | "nonempty" | "float";

export interface CompareOutputOptions {
  /**
   * How tolerant the comparison is. Defaults to "lenient" — the historical
   * behaviour — so existing callers are byte-for-byte unaffected.
   *  - exact:      normalized line equality only (no space/comma fuzzing).
   *  - whitespace: ignore all whitespace differences.
   *  - nonempty:   pass if the program produced any non-empty output.
   *  - float:      token-wise numeric comparison within `epsilon`.
   *  - lenient:    exact OR whitespace-insensitive OR comma-spacing-insensitive.
   */
  mode?: OutputCompareMode;
  /** Absolute tolerance for "float" mode. */
  epsilon?: number;
}

/** Map a judge CheckerSpec to the equivalent local comparison mode. */
export function compareModeFromChecker(checker?: CheckerSpec | null): CompareOutputOptions {
  if (!checker || typeof (checker as any).type !== "string") return { mode: "lenient" };
  switch (checker.type) {
    case "exact": return { mode: "exact" };
    case "whitespace": return { mode: "whitespace" };
    case "nonempty": return { mode: "nonempty" };
    case "float": return { mode: "float", epsilon: (checker as any).epsilon ?? 1e-6 };
    default: return { mode: "lenient" };
  }
}

/** Convenience: compare using a task's checker spec. */
export function compareOutputWithChecker(actual: string, expected: string, checker?: CheckerSpec | null): boolean {
  return compareOutput(actual, expected, compareModeFromChecker(checker));
}

function compareFloatTokens(actual: string, expected: string, epsilon: number): boolean {
  const a = actual.split(/\s+/).filter(Boolean);
  const e = expected.split(/\s+/).filter(Boolean);
  if (a.length !== e.length) return false;
  for (let i = 0; i < e.length; i++) {
    const an = Number(a[i]);
    const en = Number(e[i]);
    const bothNumeric = Number.isFinite(an) && Number.isFinite(en);
    if (bothNumeric) {
      if (Math.abs(an - en) > epsilon) return false;
    } else if (a[i] !== e[i]) {
      // Non-numeric tokens (labels, words) must match exactly.
      return false;
    }
  }
  return true;
}

export function compareOutput(actual: string, expected: string, options?: CompareOutputOptions): boolean {
  const hasCyrillic = (s: string) => /[\u0400-\u04FF]/.test(s);
  const safeNfc = (s: string) => {
    try {
      return s.normalize("NFC");
    } catch {
      return s;
    }
  };
  const normalizeApostrophes = (s: string) => s.replace(/[\u2018\u2019\u201B\u2032\u02BC]/g, "'");
  const normalizeInvisibles = (s: string) => s.replace(/\u00A0/g, " ").replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
  const toConfusableSkeleton = (s: string) => {
    let out = "";
    for (const ch of s) {
      switch (ch) {
        case "A":
        case "А":
          out += "A";
          break;
        case "a":
        case "а":
          out += "a";
          break;
        case "B":
        case "В":
          out += "B";
          break;
        case "C":
        case "С":
          out += "C";
          break;
        case "c":
        case "с":
          out += "c";
          break;
        case "E":
        case "Е":
          out += "E";
          break;
        case "e":
        case "е":
          out += "e";
          break;
        case "H":
        case "Н":
          out += "H";
          break;
        case "h":
        case "н":
          out += "h";
          break;
        case "I":
        case "І":
          out += "I";
          break;
        case "i":
        case "і":
          out += "i";
          break;
        case "K":
        case "К":
          out += "K";
          break;
        case "k":
        case "к":
          out += "k";
          break;
        case "M":
        case "М":
          out += "M";
          break;
        case "m":
        case "м":
          out += "m";
          break;
        case "O":
        case "О":
          out += "O";
          break;
        case "o":
        case "о":
          out += "o";
          break;
        case "P":
        case "Р":
          out += "P";
          break;
        case "p":
        case "р":
          out += "p";
          break;
        case "T":
        case "Т":
          out += "T";
          break;
        case "t":
        case "т":
          out += "t";
          break;
        case "X":
        case "Х":
          out += "X";
          break;
        case "x":
        case "х":
          out += "x";
          break;
        case "Y":
        case "У":
          out += "Y";
          break;
        case "y":
        case "у":
          out += "y";
          break;
        default:
          out += ch;
      }
    }
    return out;
  };

  const expectedHasCyr = hasCyrillic(String(expected ?? ""));
  const normalize = (str: string) => {
    let normalized = String(str ?? "");
    normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    normalized = normalizeInvisibles(normalized);
    normalized = normalizeApostrophes(normalized);
    normalized = safeNfc(normalized);
    if (expectedHasCyr) normalized = toConfusableSkeleton(normalized);
    normalized = normalized.trim();
    const lines = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    return lines.join("\n");
  };
  const mode: OutputCompareMode = options?.mode ?? "lenient";

  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);

  // "nonempty": the only requirement is that the program produced output.
  if (mode === "nonempty") return normalizedActual.length > 0;

  // "float": token-wise numeric comparison within epsilon.
  if (mode === "float") {
    if (normalizedActual === normalizedExpected) return true;
    return compareFloatTokens(normalizedActual, normalizedExpected, options?.epsilon ?? 1e-6);
  }

  // Exact (post-normalization) equality is accepted by every mode.
  if (normalizedActual === normalizedExpected) return true;

  // "exact": no further fuzzing — a real exact checker must reject here.
  if (mode === "exact") return false;

  const noSpacesActual = normalizedActual.replace(/\s+/g, "");
  const noSpacesExpected = normalizedExpected.replace(/\s+/g, "");
  if (noSpacesActual === noSpacesExpected) return true;

  // "whitespace": whitespace-insensitive only; stop before comma fuzzing.
  if (mode === "whitespace") return false;

  // "lenient" (default, historical behaviour): also ignore comma spacing.
  const normalizeCommas = (str: string) => str.replace(/,\s+/g, ",").replace(/\s+,/g, ",");
  if (normalizeCommas(normalizedActual) === normalizeCommas(normalizedExpected)) return true;
  return false;
}