import { normalizeJudgeMemoryMb } from "./limits";
import type { JudgeLanguage } from "./types";

type Defaults = { time_limit_ms: number; memory_limit_mb: number };
type TaskLimits = {
  timeLimitMs?: number | null;
  memoryLimitMb?: number | null;
};
const positive = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/** Uses the same defaults and memory normalization as the submission pipeline. */
export function taskLimitsByLanguage(
  task: TaskLimits,
  defaults: Record<JudgeLanguage, Defaults>,
  languages: JudgeLanguage[],
) {
  return Object.fromEntries(
    languages.map((language) => [
      language,
      {
        timeLimitMs:
          positive(task.timeLimitMs) ?? defaults[language].time_limit_ms,
        memoryLimitMb: normalizeJudgeMemoryMb(
          language,
          positive(task.memoryLimitMb),
          defaults[language].memory_limit_mb,
        ),
      },
    ]),
  );
}
