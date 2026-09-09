import { env } from "../env";
import type { JudgeLanguage } from "../services/judgeWorker/types";

/** Languages supported by the judge worker and exposed by public routes. */
export const ALL_JUDGE_LANGUAGES: readonly JudgeLanguage[] = [
  "java", "python", "cpp", "c", "csharp", "kotlin",
  "js", "go", "rust", "pascal",
  "d", "dart", "haskell", "lisp", "lua", "perl", "php", "ruby", "swift",
];

/** Languages accepted by the legacy/admin library editor. */
export const CORE_JUDGE_LANGUAGES: readonly JudgeLanguage[] = [
  "java", "python", "cpp", "c", "csharp", "kotlin",
];

export function parseDisabledJudgeLanguages(
  raw: string | undefined,
  supported: readonly JudgeLanguage[] = ALL_JUDGE_LANGUAGES,
): Set<JudgeLanguage> {
  const supportedSet = new Set<JudgeLanguage>(supported);
  return new Set(
    String(raw ?? "")
      .split(/[,\s]+/g)
      .map(value => value.trim().toLowerCase())
      .filter((value): value is JudgeLanguage => supportedSet.has(value as JudgeLanguage)),
  );
}

export function getDisabledJudgeLanguages(
  supported: readonly JudgeLanguage[] = ALL_JUDGE_LANGUAGES,
): Set<JudgeLanguage> {
  const raw = [env.JUDGE_DISABLED_LANGUAGES, env.DISABLED_JUDGE_LANGUAGES]
    .filter(Boolean)
    .join(",");
  return parseDisabledJudgeLanguages(raw, supported);
}

export function filterEnabledJudgeLanguages<T extends JudgeLanguage>(
  languages: readonly T[],
  disabled: ReadonlySet<JudgeLanguage> = getDisabledJudgeLanguages(),
): T[] {
  return languages.filter(language => !disabled.has(language));
}

export function normalizeJudgeLanguage(
  raw: unknown,
  supported: readonly JudgeLanguage[] = ALL_JUDGE_LANGUAGES,
): JudgeLanguage | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (supported as readonly string[]).includes(value)
    ? value as JudgeLanguage
    : null;
}
