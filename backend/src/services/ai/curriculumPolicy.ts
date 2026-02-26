export type SupportedLanguage = "JAVA" | "PYTHON" | "CPP";

export function getCurriculumPolicyViolationForGeneratedTask(params: {
  lang: SupportedLanguage;
  topicIndex?: number | null;
  title?: string | null;
  practicalTask?: string | null;
}): string | null {
  const lang = params.lang;
  const topicIndex = typeof params.topicIndex === "number" && Number.isFinite(params.topicIndex)
    ? Math.floor(params.topicIndex)
    : null;

  const text = `${String(params.title ?? "")}\n${String(params.practicalTask ?? "")}`.toLowerCase();

  if (!text.trim()) return null;

  // Platform constraint: tasks must be judgeable in an online judge environment.
  // Reject tasks that require creating files/folders, IDE configuration, or project scaffolding.
  // (These cannot be reliably auto-tested from stdin/stdout.)
  {
    const hasCreateVerb = /(створ(и|іть|ити)|зроб(и|іть|ити)|налашт(уй|уйте|увати)|створити|налаштування|setup|configure|create)/i.test(text);
    const hasFileOpsNouns = /(файл(и|ів|у|ом)?|каталог(и|ів|у|ом)?|папк(а|и|у|ою|ах)?|директор(ія|ії|ію|іями)?|проєкт(у|ом|і)?|project|folder|directory|ide|vscode|visual\s+studio|clion|cmake)/i.test(text);
    const mentionsTypicalPathsOrFiles = /(\bsrc\b|\binclude\b|cmakelists\.txt|makefile|main\.cpp|\.cpp\b|\.h\b|\.hpp\b)/i.test(text);
    if (hasCreateVerb && (hasFileOpsNouns || mentionsTypicalPathsOrFiles)) {
      return "NON_JUDGEABLE_TASK: Task requires file/project/IDE actions (create folders/files, setup project). Personal tasks must be solvable by writing code in a single file and checked by stdout.";
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
