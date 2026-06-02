export type SupportedLanguage = "JAVA" | "PYTHON" | "CPP";

function hasCreateVerbForScaffolding(text: string): boolean {
  return /(створ(и|іть|ити)|додай(те)?|зроб(и|іть|ити)|налашт(уй|уйте|увати)|setup|configure|create|add)/i.test(text);
}

function hasFileOpsNouns(text: string): boolean {
  return /(файл(и|ів|у|ом)?|каталог(и|ів|у|ом)?|папк(а|и|у|ою|ах)?|директор(ія|ії|ію|іями)?|проєкт(у|ом|і)?|project|folder|directory|ide|vscode|visual\s+studio|clion|cmake)/i.test(text);
}

function hasScaffoldingPathHints(text: string): boolean {
  return /(\bsrc\b|\binclude\b|cmakelists\.txt|makefile|pom\.xml|build\.gradle)/i.test(text);
}

function hasExplicitCreateNamedFile(text: string): boolean {
  return /(створ(и|іть|ити)|add|create)\b[^\n.!?]{0,80}\b[a-z0-9_.-]+\.(cpp|h|hpp|java|py|txt|md)\b/i.test(text);
}

function isNonJudgeableScaffoldingText(practicalText: string): boolean {
  const text = String(practicalText ?? "").toLowerCase();
  const hasCreateVerb = hasCreateVerbForScaffolding(text);
  return hasCreateVerb && (hasFileOpsNouns(text) || hasScaffoldingPathHints(text) || hasExplicitCreateNamedFile(text));
}

function hasFunctionTaskVerb(text: string): boolean {
  // `напис` covers "написати/написав"; `напиш` is required for the imperative
  // "напишіть/напиши" (напиш-, not напис-) — without it UA function-impl tasks
  // slip through. Likewise `реалізуй` imperative alongside the `реаліз` stem.
  return /(write|implement|define|create|declare|develop|build|design|make|реаліз|напиш|напис|створ|визнач|оголос|розроб|імплемент|опиш|склад(и|іть))/i.test(text);
}

function hasFunctionTaskNoun(text: string): boolean {
  return /(\bfunction\b|\bmethod\b|\bprocedure\b|функц|метод|процедур)/i.test(text);
}

export function looksLikeFunctionImplementationTask(practicalText: string): boolean {
  const raw = String(practicalText ?? "");
  const text = raw.toLowerCase();

  if (hasFunctionTaskNoun(text) && hasFunctionTaskVerb(text)) return true;

  if (/\bdef\s+[a-z_][a-z0-9_]*\s*\(/i.test(raw)) return true;
  if (/\bpublic\s+static\s+\w+\s+\w+\s*\(/i.test(raw)) return true;

  if (hasFunctionTaskNoun(text) && /(must|should|has to)\s+return|повинн\w*\s+поверт|має\s+поверт/.test(text)) return true;

  return false;
}

function splitPracticalTaskToClauses(practicalTask: string): string[] {
  return String(practicalTask ?? "")
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?:[.!?…]+\s+)|(?:;\s+)/g))
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferLanguageForGenericOutputHint(text: string): "uk" | "en" {
  const hasCyrillic = /[а-яіїєґ]/i.test(text);
  if (hasCyrillic) return "uk";
  return "en";
}

export function rewriteNonJudgeablePracticalTaskToJudgeable(practicalTask: string): string | null {
  const source = String(practicalTask ?? "").trim();
  if (!source) return null;

  if (!isNonJudgeableScaffoldingText(source)) {
    return source;
  }

  const clauses = splitPracticalTaskToClauses(source);
  const kept = clauses.filter((clause) => !isNonJudgeableScaffoldingText(clause));
  if (kept.length === 0) return null;

  let rewritten = kept.join(". ").replace(/\s+/g, " ").trim();
  if (rewritten.length < 16) return null;
  if (!/[.!?…:]$/.test(rewritten)) rewritten = `${rewritten}.`;

  if (!/(вивед|output|print|stdout)/i.test(rewritten)) {
    const lang = inferLanguageForGenericOutputHint(source);
    rewritten += lang === "uk"
      ? " Виведіть результат у stdout згідно з умовою."
      : " Output the result to stdout according to the statement.";
  }

  if (isNonJudgeableScaffoldingText(rewritten)) return null;
  return rewritten;
}

// Topic titles where implementing a standalone function/method IS the lesson —
// in those topics the "looks like function implementation" rejection would
// destroy the curriculum. We still rely on the surrounding prompt to insist on
// a `main()` driver, but the policy gate is relaxed.
function isFunctionsTopic(title: string): boolean {
  const t = String(title ?? "").toLowerCase();
  return /(функц|метод|процедур|підпрограм|\bfunctions?\b|\bmethods?\b|\bprocedures?\b)/i.test(t);
}

export function getCurriculumPolicyViolationForGeneratedTask(params: {
  lang: SupportedLanguage;
  topicIndex?: number | null;
  topicTitle?: string | null;
  title?: string | null;
  practicalTask?: string | null;
}): string | null {
  const lang = params.lang;
  const topicIndex = typeof params.topicIndex === "number" && Number.isFinite(params.topicIndex)
    ? Math.floor(params.topicIndex)
    : null;

  const text = `${String(params.title ?? "")}\n${String(params.practicalTask ?? "")}`.toLowerCase();
  const practicalText = String(params.practicalTask ?? "").toLowerCase();

  if (!text.trim()) return null;

  // Platform constraint: tasks must be judgeable in an online judge environment.
  // Reject tasks that require creating files/folders, IDE configuration, or project scaffolding.
  // (These cannot be reliably auto-tested from stdin/stdout.)
  {
    if (isNonJudgeableScaffoldingText(practicalText)) {
      return "NON_JUDGEABLE_TASK: Task requires file/project/IDE actions (create folders/files, setup project). Personal tasks must be solvable by writing code in a single file and checked by stdout.";
    }
  }

  // Skip the "looks like function implementation" rejection when the topic IS
  // about functions. Without this, every task on the "Functions" / "Methods"
  // chapter would fail validation indefinitely.
  const topicAboutFunctions = isFunctionsTopic(params.topicTitle ?? "");
  if (!topicAboutFunctions) {
    if (looksLikeFunctionImplementationTask(practicalText)) {
      return "NON_JUDGEABLE_TASK: Task asks to implement a function/method instead of a full program with stdin/stdout. Such tasks require unit tests and cannot be auto-checked by stdout only.";
    }
  }

  // C++ curriculum: topicIndex is 0-based.
  // 0: Intro, 1: Project setup/structure, 2: Variables.
  // Early topics must not require variables before they are taught.
  if (lang === "CPP" && topicIndex !== null && topicIndex < 2) {
    // NOTE: Do not use `\b` boundaries for Ukrainian; JS word boundaries are ASCII-based.
    if (text.includes("змінн")) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task mentions variables.`;
    }
    if (text.includes("оголос")) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task asks to declare something (likely a variable).`;
    }
    if (text.includes("ініціаліз") || text.includes("ініціалізаці")) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task asks to initialize.`;
    }
    if (text.includes("присво") || text.includes("присвоєн")) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task asks to assign values.`;
    }
    if (/\bdeclare\b/i.test(text)) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task asks to declare (EN).`;
    }
    if (/\bvariable\b/i.test(text)) {
      return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task mentions variables (EN).`;
    }

    // Additional heuristic: explicit type declaration like "int x" (but do not block "int main").
    const decl = /\b(int|double|float|char|bool|long|short)\s+([a-z_][a-z0-9_]*)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = decl.exec(text)) !== null) {
      const name = String(m[2] ?? "").toLowerCase();
      if (name && name !== "main") {
        return `UNTAUGHT_CONCEPT: This topic is before variables are taught (topicIndex=${topicIndex}). The generated task suggests a variable declaration ("${m[1]} ${m[2]}").`;
      }
    }
  }

  return null;
}
