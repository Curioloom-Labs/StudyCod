import { getLanguage } from "../../../judge/languages/registry";
import { normalizeAssessRuntime, normalizeJudgeLanguage } from "../config/judgeLanguages";
import type { JudgeLanguage } from "./judgeWorker/types";

export function assessJudgeLanguage(runtime: unknown): JudgeLanguage | null {
  const normalized = normalizeAssessRuntime(runtime);
  return normalized ? normalizeJudgeLanguage(normalized.toLowerCase()) : null;
}

export function assessEntryFile(runtime: unknown): string | null {
  const language = assessJudgeLanguage(runtime);
  return language ? getLanguage(language).entryFile : null;
}
