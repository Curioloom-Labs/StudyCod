import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { recordLearningEvent } from "../lib/api/library";
import { announceMascot } from "./MascotCompanion";
import "./FailureRecoveryCard.css";

type Props = {
  verdict?: string | null;
  testsPassed?: number;
  testsTotal?: number;
  score?: number | null;
  maxScore?: number | null;
  firstFailure?: FailureRecoveryData | null;
  compileError?: string | null;
  compileErrorKind?: string | null;
  topic?: string | null;
  success?: boolean;
  taskId?: number;
  taskKind?: "LIBRARY" | "PERSONAL" | "EDU" | "UNKNOWN";
  learningAttemptId?: number | null;
  failureCategory?: string | null;
  highestHintLevelShown?: number;
  nextTask?: { id: number; title: string } | null;
  onTryAgain?: () => void;
  onNextTask?: () => void;
};

export type FailureRecoveryData = {
  testPublicIndex?: number;
  inputPreview?: string;
  expectedPreview?: string;
  actualPreview?: string;
  testId?: number;
  errorKind?: string | null;
  verdict?: string | null;
};

const languageCopy = (isEnglish: boolean, uk: string, en: string) => isEnglish ? en : uk;

function categoryLabel(kind: string | null | undefined, isEnglish: boolean): string | null {
  const value = String(kind ?? "").toLowerCase();
  const labels: Record<string, [string, string]> = {
    compile: ["компіляція", "compilation"],
    format: ["формат виводу", "output format"],
    logic: ["логіка", "logic"],
    runtime: ["помилка виконання", "runtime"],
    timeout: ["час виконання", "time limit"],
    oom: ["пам’ять", "memory limit"],
    off_by_one: ["межі діапазону", "boundary condition"],
  };
  const label = labels[value];
  return label ? languageCopy(isEnglish, label[0], label[1]) : null;
}

function hintLevels(kind: string | null | undefined, compileError: string | null | undefined, isEnglish: boolean): string[] {
  const value = String(kind ?? "").toLowerCase();
  if (value === "compile" || compileError) {
    return [
      languageCopy(isEnglish, "Знайди перше повідомлення компілятора — воно зазвичай вказує на місце проблеми.", "Read the first compiler message — it usually points to the problem location."),
      languageCopy(isEnglish, "Перевір синтаксис, типи, імпорти та відповідність назви файлу точці входу.", "Check syntax, types, imports, and whether the file name matches the entry point."),
      languageCopy(isEnglish, "Виправ лише першу помилку, скомпілюй ще раз і подивися, що змінилося.", "Fix the first error, compile again, and inspect what changed."),
    ];
  }
  if (value === "format") {
    return [
      languageCopy(isEnglish, "Проблема пов’язана з тим, що саме програма друкує.", "The issue is in what the program prints."),
      languageCopy(isEnglish, "Згадай різницю між пробілом, переносом рядка та порядком значень.", "Recall the difference between spaces, newlines, and value order."),
      languageCopy(isEnglish, "Звір один невдалий приклад із форматом у задачі й зміни тільки побудову виводу.", "Compare one failing example with the required format and change only output construction."),
    ];
  }
  if (value === "timeout") {
    return [
      languageCopy(isEnglish, "Знайди цикл або операцію, яка повторює зайву роботу.", "Find the loop or operation that repeats unnecessary work."),
      languageCopy(isEnglish, "Оціни складність рішення відносно максимального розміру вводу.", "Estimate the solution’s complexity against the maximum input size."),
      languageCopy(isEnglish, "Спробуй зберігати вже обчислене або перейти до структури даних із швидшим доступом.", "Reuse computed values or choose a data structure with faster access."),
    ];
  }
  if (value === "runtime") {
    return [
      languageCopy(isEnglish, "Знайди операцію, на якій виконання зупинилося.", "Find the operation where execution stopped."),
      languageCopy(isEnglish, "Перевір порожній ввід, межі індексів, ділення та неініціалізовані значення.", "Check empty input, index bounds, division, and uninitialized values."),
      languageCopy(isEnglish, "Додай перевірку перед цією операцією, не змінюючи всю структуру рішення.", "Add a guard before that operation without rewriting the whole solution."),
    ];
  }
  return [
    languageCopy(isEnglish, "Почни з першого невдалого тесту та місця, де результат міг відхилитися.", "Start with the first failing test and the place where the result could diverge."),
    languageCopy(isEnglish, "Перевір умову, формулу та крайові випадки: 0, 1, порожній або максимальний ввід.", "Check the condition, formula, and edge cases: 0, 1, empty, or maximum input."),
    languageCopy(isEnglish, "Пройди обчислення вручну на цьому випадку й зміни лише крок, який дає неправильний результат.", "Trace this case by hand and change only the step that produces the wrong result."),
  ];
}

function hintStageLabel(level: number, isEnglish: boolean): string {
  const labels = isEnglish
    ? ["Observe", "Narrow", "Act"]
    : ["Спостерігай", "Звузь пошук", "Дій"];
  return labels[Math.max(0, Math.min(labels.length - 1, level))];
}

export const FailureRecoveryCard: React.FC<Props> = ({ verdict, testsPassed = 0, testsTotal = 0, score, maxScore, firstFailure, compileError, compileErrorKind, taskId, taskKind = "LIBRARY", learningAttemptId, failureCategory, highestHintLevelShown = 0, onTryAgain }) => {
  const { i18n } = useTranslation();
  const isEnglish = i18n.language?.toLowerCase().startsWith("en");
  const upperVerdict = String(verdict ?? "").toUpperCase();
  const persistedCategory = failureCategory ?? firstFailure?.errorKind ?? compileErrorKind;
  const [hintLevel, setHintLevel] = useState(() => Math.max(0, Math.min(2, Number(highestHintLevelShown) || 0)));
  const reportedHintKey = useRef<string | null>(null);
  const hints = hintLevels(persistedCategory, compileError, isEnglish);
  const category = categoryLabel(persistedCategory, isEnglish);
  const hasTestCount = testsTotal > 0;
  const resultLabel = hasTestCount
    ? `${testsPassed}/${testsTotal} ${languageCopy(isEnglish, "тестів", "tests")}`
    : `${score ?? "—"}/${maxScore ?? 100}`;

  useEffect(() => {
    setHintLevel(Math.max(0, Math.min(2, Number(highestHintLevelShown) || 0)));
    reportedHintKey.current = null;
  }, [learningAttemptId, highestHintLevelShown, persistedCategory]);

  useEffect(() => {
    if (upperVerdict === "AC" || !taskId) return;
    const key = `${taskKind}:${taskId}:${learningAttemptId ?? "none"}:${hintLevel + 1}`;
    if (reportedHintKey.current === key) return;
    reportedHintKey.current = key;
    void recordLearningEvent({
      eventType: "hint_viewed",
      taskId,
      taskKind,
      learningAttemptId,
      failureCategory: persistedCategory,
      hintLevel: hintLevel + 1,
    }).catch(() => undefined);
  }, [upperVerdict, taskId, taskKind, learningAttemptId, persistedCategory, hintLevel]);

  useEffect(() => {
    if (upperVerdict === "AC") return;
    announceMascot({
      variant: "encourage",
      uk: "Це не глухий кут. Подивись на першу невдачу й виправ одну річ за раз.",
      en: "This is not a dead end. Inspect the first failure and change one thing at a time.",
    });
  }, [upperVerdict, taskId, learningAttemptId]);

  if (upperVerdict === "AC") return null;

  const workflowSteps = isEnglish
    ? ["Failed", "Diagnosed", "Hint", "Retry", "Skill"]
    : ["Збій", "Діагноз", "Підказка", "Повтор", "Навичка"];

  return (
    <div className="failure-recovery-card mt-4 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#72edb0]">
            <Sparkles className="size-4" />
            {languageCopy(isEnglish, "Знайдемо наступний крок", "Let’s find the next step")}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#a7b9ac]">
            {languageCopy(isEnglish, "Невдала спроба — це сигнал для наступної перевірки, а не готове рішення.", "A failed attempt is a signal for the next check, not a finished solution.")}
          </p>
        </div>
        <span className="rounded-full bg-[#ff6b9d]/10 px-2.5 py-1 text-[10px] font-bold text-[#ff9aba]">{upperVerdict || "—"}</span>
      </div>

      <div className="failure-recovery-steps" aria-label={languageCopy(isEnglish, "Шлях від помилки до навички", "Path from failure to skill")}>
        {workflowSteps.map((step, index) => {
          const completed = index < 2;
          const current = index === 2;
          return (
            <React.Fragment key={step}>
              <div className={`failure-recovery-step ${completed ? "is-complete" : ""} ${current ? "is-current" : ""}`}>
                <span className="failure-recovery-step-dot">{completed ? "✓" : index + 1}</span>
                <span>{step}</span>
              </div>
              {index < workflowSteps.length - 1 && <span className={`failure-recovery-step-line ${completed ? "is-complete" : ""}`} aria-hidden="true" />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[.05] p-3 text-xs text-[#cbd9ce]">
          <span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{languageCopy(isEnglish, hasTestCount ? "Що не пройшло" : "Результат", hasTestCount ? "What failed" : "Result")}</span>
          <strong className="mt-1 block">{resultLabel}{hasTestCount && (firstFailure?.testId ?? firstFailure?.testPublicIndex) ? ` · #${firstFailure.testId ?? firstFailure.testPublicIndex}` : ""}</strong>
        </div>
        <div className="rounded-xl bg-white/[.05] p-3 text-xs text-[#cbd9ce]">
          <span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{languageCopy(isEnglish, "Категорія", "Category")}</span>
          <strong className="mt-1 block">{category ?? languageCopy(isEnglish, "Поки не визначено надійно", "Not reliably determined yet")}</strong>
        </div>
      </div>

      {(firstFailure?.expectedPreview || firstFailure?.actualPreview || firstFailure?.inputPreview) && (
        <details className="mt-4 rounded-xl border border-white/10 bg-white/[.035] p-3 text-xs text-[#cbd9ce]">
          <summary className="cursor-pointer list-none font-semibold text-[#dce9df]">
            {languageCopy(isEnglish, "Подивитися доказ невдалого тесту", "Inspect the failing-test evidence")}
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              [languageCopy(isEnglish, "Ввід", "Input"), firstFailure?.inputPreview],
              [languageCopy(isEnglish, "Очікувано", "Expected"), firstFailure?.expectedPreview],
              [languageCopy(isEnglish, "Отримано", "Actual"), firstFailure?.actualPreview],
            ].map(([label, value]) => value ? <div key={label} className="min-w-0"><span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{label}</span><code className="mt-1 block max-h-20 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/20 p-2 text-[11px] text-[#e1eee4]">{value}</code></div> : null)}
          </div>
        </details>
      )}

      <div className="mt-4 rounded-xl border border-[#00d978]/20 bg-[#00d978]/[.06] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#72edb0]">{languageCopy(isEnglish, `Підказка ${hintLevel + 1} з ${hints.length}`, `Hint ${hintLevel + 1} of ${hints.length}`)}</div>
          <span className="rounded-full bg-white/[.07] px-2 py-1 text-[10px] font-semibold text-[#a7b9ac]">{hintStageLabel(hintLevel, isEnglish)}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#e1eee4]">{hints[hintLevel]}</p>
        <p className="mt-2 text-[11px] leading-5 text-[#9fb5a5]">{languageCopy(isEnglish, "Підказка спрямовує до власного рішення й не показує готовий код.", "This hint points toward your own solution and does not reveal the finished code.")}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => {
          const nextLevel = Math.min(hints.length - 1, hintLevel + 1);
          setHintLevel(nextLevel);
          if (taskId && nextLevel > hintLevel) {
            void recordLearningEvent({
              eventType: "hint_viewed",
              taskId,
              taskKind,
              learningAttemptId,
              failureCategory: persistedCategory,
              hintLevel: nextLevel + 1,
            }).catch(() => undefined);
          }
        }} disabled={hintLevel >= hints.length - 1} className="inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-3.5 py-2.5 text-xs font-bold text-[#062211] disabled:cursor-not-allowed disabled:opacity-45">
          {languageCopy(isEnglish, "Показати ще одну підказку", "Show another hint")} <ArrowRight className="size-3.5" />
        </button>
        <button type="button" onClick={() => {
          if (taskId) {
            void recordLearningEvent({ eventType: "retry_started", taskId, taskKind, learningAttemptId, failureCategory: persistedCategory }).catch(() => undefined);
          }
          onTryAgain?.();
        }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-[#dbe8de] hover:bg-white/[.06]">
          <RotateCcw className="size-3.5" /> {languageCopy(isEnglish, "Спробувати ще раз", "Try again")}
        </button>
      </div>
    </div>
  );
};

export default FailureRecoveryCard;
