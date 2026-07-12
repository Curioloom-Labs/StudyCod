import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Lightbulb, RefreshCcw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../i18n";

export type TaskGenerationPhase =
  | "requesting"
  | "generating"
  | "syncing"
  | "opening"
  | "finishing"
  | "error";

const PHASE_ORDER: TaskGenerationPhase[] = ["requesting", "generating", "syncing", "opening", "finishing"];

type MiniChallenge = {
  question: string;
  options: string[];
  correctIndex: number;
  successText: string;
  failText: string;
};

type OverlayMiniGameMode = "quiz" | "reflex";

function randomPercent(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function TaskGenerationOverlay(props: { open: boolean; phase?: TaskGenerationPhase | null }) {
  const { open, phase } = props;
  const { i18n } = useTranslation();

  const phaseSteps = useMemo<Record<TaskGenerationPhase, string>>(() => {
    return {
      requesting: tr("Надсилаю запит на генерацію", "Sending generation request"),
      generating: tr("Генерую завдання на сервері", "Generating task on server"),
      syncing: tr("Оновлюю список завдань", "Refreshing tasks list"),
      opening: tr("Відкриваю нове завдання", "Opening the new task"),
      finishing: tr("Завершую підготовку інтерфейсу", "Finalizing UI setup"),
      error: tr("Помилка генерації", "Generation failed"),
    };
  }, [i18n.language]);

  const loadingTips = useMemo<string[]>(() => {
    return [
      tr("Порада: спочатку пройдися по прикладах і придумай 2 крайові випадки — це часто рятує від WA.", "Tip: start from examples and invent 2 edge cases — this often prevents WA."),
      tr("Лайфхак: перед сабмітом звір, чи формат виводу (пробіли/переноси) збігається 1:1.", "Pro tip: before submit, verify output format (spaces/newlines) matches exactly."),
      tr("Міні-ритуал: короткий dry-run на папері/в голові перед запуском економить купу часу.", "Mini ritual: do a quick dry-run before running — it saves lots of time."),
      tr("Якщо тести падають дивно — перевір граничні значення 0, 1, min/max.", "If tests fail unexpectedly, check edge values: 0, 1, min/max."),
      tr("Короткий цикл: " + "спочатку correctness, потім readability, і лише тоді optimization.", "Quick loop: correctness first, readability second, optimization third."),
    ];
  }, [i18n.language]);

  const miniChallenges = useMemo<MiniChallenge[]>(() => {
    return [
      {
        question: tr("Скільки разів виконається цикл: for (i = 0; i < 5; i++) ?", "How many times does this loop execute: for (i = 0; i < 5; i++) ?"),
        options: ["4", "5", "6"],
        correctIndex: 1,
        successText: tr("Точно! Індекси: 0,1,2,3,4.", "Correct! Indices are 0,1,2,3,4."),
        failText: tr("Майже 🙂 Підказка: цикл стартує з 0 і зупиняється перед 5.", "Close 🙂 Hint: starts at 0 and stops before 5."),
      },
      {
        question: tr("Яка асимптотична складність бінарного пошуку?", "What is the asymptotic complexity of binary search?"),
        options: ["O(n)", "O(log n)", "O(n log n)"],
        correctIndex: 1,
        successText: tr("Так! На кожному кроці відкидаємо половину діапазону.", "Yes! Each step halves the search range."),
        failText: tr("Ще трошки. Бінарний пошук кожного кроку ділить діапазон навпіл.", "Almost there. Binary search halves the range each step."),
      },
      {
        question: tr("Що важливіше для першого робочого сабміту?", "What matters most for the first working submission?"),
        options: [
          tr("Максимальна оптимізація", "Maximum optimization"),
          tr("Коректність на базових і крайових тестах", "Correctness on basic and edge tests"),
          tr("Ідеальний рефакторинг", "Perfect refactoring"),
        ],
        correctIndex: 1,
        successText: tr("Абсолютно. Спочатку correct, потім optimize.", "Exactly. Correctness first, optimization later."),
        failText: tr("Секрет продуктивності: спочатку зроби правильно, потім пришвидшуй.", "The productivity secret: make it correct first, then speed it up."),
      },
    ];
  }, [i18n.language]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [miniGameMode, setMiniGameMode] = useState<OverlayMiniGameMode>("quiz");
  const [reflexScore, setReflexScore] = useState(0);
  const [reflexBest, setReflexBest] = useState(0);
  const [reflexTimeLeft, setReflexTimeLeft] = useState(12);
  const [reflexTargetPos, setReflexTargetPos] = useState<{ x: number; y: number }>({ x: 14, y: 45 });

  const moveReflexTarget = useCallback(() => {
    setReflexTargetPos({
      x: randomPercent(12, 88),
      y: randomPercent(18, 82),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      setTipIndex(0);
      setChallengeIndex(0);
      setSelectedOption(null);
      setMiniGameMode("quiz");
      setReflexScore(0);
      setReflexTimeLeft(12);
      setReflexTargetPos({ x: 14, y: 45 });
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds((v: number) => v + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!loadingTips.length) return;
    const id = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % loadingTips.length);
    }, 4500);
    return () => clearInterval(id);
  }, [open, loadingTips.length]);

  useEffect(() => {
    if (!open) return;
    if (!miniChallenges.length) return;
    setChallengeIndex(Math.floor(Math.random() * miniChallenges.length));
    setSelectedOption(null);
  }, [open, miniChallenges.length]);

  useEffect(() => {
    if (!open || miniGameMode !== "reflex") return;
    const id = setInterval(() => {
      setReflexTimeLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [open, miniGameMode]);

  useEffect(() => {
    if (reflexTimeLeft !== 0) return;
    setReflexBest((prev) => Math.max(prev, reflexScore));
  }, [reflexScore, reflexTimeLeft]);

  const activePhase: TaskGenerationPhase = phase ?? "generating";
  const currentStepLabel = phaseSteps[activePhase];
  const activePhaseIndex = PHASE_ORDER.indexOf(activePhase);
  const progressPercent = activePhase === "error"
    ? 100
    : Math.max(10, Math.round(((Math.max(0, activePhaseIndex) + 1) / PHASE_ORDER.length) * 100));

  const activeTip = loadingTips[tipIndex] ?? loadingTips[0] ?? "";
  const challenge = miniChallenges[challengeIndex] ?? null;
  const answeredCorrectly = challenge && selectedOption !== null ? selectedOption === challenge.correctIndex : null;

  const nextChallenge = () => {
    if (!miniChallenges.length) return;
    setSelectedOption(null);
    setChallengeIndex((prev) => (prev + 1) % miniChallenges.length);
  };

  const handleReflexHit = () => {
    if (reflexTimeLeft <= 0) return;
    setReflexScore((prev) => prev + 1);
    moveReflexTarget();
  };

  const restartReflex = () => {
    setReflexBest((prev) => Math.max(prev, reflexScore));
    setReflexScore(0);
    setReflexTimeLeft(12);
    moveReflexTarget();
  };

  const reflexBadge = reflexScore >= 18
    ? tr("Реакція: ракета 🚀", "Reflex: rocket 🚀")
    : reflexScore >= 12
      ? tr("Реакція: сильна ⚡", "Reflex: strong ⚡")
      : reflexScore >= 7
        ? tr("Реакція: добра 👍", "Reflex: good 👍")
        : tr("Реакція: розігрів 🧠", "Reflex: warming up 🧠");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-[#07100a]/70 p-4 backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-label={tr("Генерація завдання", "Task generation")}
    >
      <div className="relative w-[min(760px,calc(100vw-28px))] overflow-hidden rounded-[34px] border border-white/10 bg-[#f7f9f6] text-[#142017] shadow-[0_35px_110px_rgba(0,0,0,.38)] dark:bg-[#101812] dark:text-[#eef6ef]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#00ff88]/16 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-[#ff8c00]/12 blur-3xl" />

        <div className="relative grid gap-0 lg:grid-cols-[1fr_300px]">
          <section className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#17251c] text-[#6ef1af] shadow-[0_18px_45px_rgba(13,42,23,.22)] dark:bg-[#edf6ef] dark:text-[#0d2115]">
                  <Sparkles className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#14864e] dark:text-[#72edb0]">
                    {tr("Створюємо практику", "Preparing practice")}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em] sm:text-4xl">
                    {tr("Підбираю нове завдання", "Crafting a new task")}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#637268] dark:text-[#a9b8ad]">
                    {tr("Синхронізую тему, рівень і формат задачі. Щойно все буде готово — відкрию робочий простір автоматично.", "Syncing topic, level and task format. Once it is ready, the workspace opens automatically.")}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm ring-1 ring-[#142017]/10 dark:bg-white/[.06] dark:ring-white/10">
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#7a887e] dark:text-[#9eaca2]">{tr("Час", "Time")}</div>
                <div className="mt-1 text-2xl font-black tracking-[-.05em]">{elapsedSeconds}{tr(" с", "s")}</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-[#25342a] dark:text-[#eaf4ed]">{currentStepLabel}</span>
                <span className="font-black text-[#14864e] dark:text-[#72edb0]">{progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#e2e9e3] dark:bg-white/[.08]">
                <div
                  className={`h-full rounded-full ${activePhase === "error" ? "bg-[#ff6b9d]" : "bg-[#00d978]"} transition-all duration-700 ease-out`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {PHASE_ORDER.map((step, idx) => {
                  const done = activePhase !== "error" && idx < activePhaseIndex;
                  const current = activePhase === step;
                  return (
                    <div key={step} className={`rounded-2xl px-3 py-3 transition ${current ? "bg-[#17251c] text-white shadow-[0_14px_34px_rgba(16,45,25,.18)] dark:bg-[#edf6ef] dark:text-[#0d2115]" : done ? "bg-[#e4f7ea] text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-white text-[#7a887e] ring-1 ring-[#142017]/8 dark:bg-white/[.045] dark:text-[#9eaca2] dark:ring-white/8"}`}>
                      <div className="text-[11px] font-black">{String(idx + 1).padStart(2, "0")}</div>
                      <div className="mt-1 truncate text-xs font-bold">{phaseSteps[step]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-[26px] border border-[#142017]/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.045]">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff4dd] text-[#d87500] dark:bg-[#ff8c00]/12 dark:text-[#ffbd73]">
                  <Lightbulb className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[#d87500] dark:text-[#ffbd73]">{tr("Поки готується", "While it loads")}</p>
                  <p className="mt-2 text-sm leading-6 text-[#35443a] dark:text-[#d9e5dc]">{activeTip}</p>
                </div>
              </div>
            </div>
          </section>

          {challenge ? (
            <aside className="relative border-t border-[#142017]/10 bg-white/72 p-5 dark:border-white/10 dark:bg-white/[.035] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[#14864e] dark:text-[#72edb0]">{tr("Коротка пауза", "Quick break")}</p>
                  <h3 className="mt-1 text-xl font-black tracking-[-.04em]">{miniGameMode === "quiz" ? tr("Перевір себе", "Check yourself") : tr("Розімни реакцію", "Warm up reflexes")}</h3>
                </div>
                <div className="grid grid-cols-2 rounded-2xl bg-[#edf3ed] p-1 dark:bg-white/[.06]">
                  <button type="button" className={`rounded-xl px-3 py-2 text-xs font-black transition ${miniGameMode === "quiz" ? "bg-white text-[#142017] shadow-sm dark:bg-[#edf6ef] dark:text-[#0d2115]" : "text-[#748278] dark:text-[#a4b2a8]"}`} onClick={() => setMiniGameMode("quiz")}>
                    {tr("Квіз", "Quiz")}
                  </button>
                  <button type="button" className={`rounded-xl px-3 py-2 text-xs font-black transition ${miniGameMode === "reflex" ? "bg-white text-[#142017] shadow-sm dark:bg-[#edf6ef] dark:text-[#0d2115]" : "text-[#748278] dark:text-[#a4b2a8]"}`} onClick={() => setMiniGameMode("reflex")}>
                    {tr("Ціль", "Target")}
                  </button>
                </div>
              </div>

              {miniGameMode === "quiz" ? (
                <div className="mt-6">
                  <p className="text-sm font-bold leading-6 text-[#24342a] dark:text-[#e7f1ea]">{challenge.question}</p>
                  <div className="mt-4 grid gap-2">
                    {challenge.options.map((option, idx) => {
                      const selected = selectedOption === idx;
                      const correct = selectedOption !== null && idx === challenge.correctIndex;
                      const wrongSelected = selected && selectedOption !== challenge.correctIndex;
                      return (
                        <button
                          key={`${challengeIndex}-${idx}-${option}`}
                          type="button"
                          onClick={() => setSelectedOption(idx)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                            correct
                              ? "border-[#00d978]/50 bg-[#e5f8eb] text-[#14613b] dark:bg-[#00ff88]/10 dark:text-[#72edb0]"
                              : wrongSelected
                                ? "border-[#ff6b9d]/50 bg-[#fff0f5] text-[#b33261] dark:bg-[#ff6b9d]/10 dark:text-[#ff9abc]"
                                : selected
                                  ? "border-[#00d978]/40 bg-[#eff8f1] text-[#142017] dark:bg-[#00ff88]/8 dark:text-[#eef6ef]"
                                  : "border-[#142017]/10 bg-[#f7faf6] text-[#526157] hover:border-[#00d978]/30 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:text-[#c5d3c9] dark:hover:bg-white/[.07]"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {answeredCorrectly !== null ? (
                    <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${answeredCorrectly ? "bg-[#e5f8eb] text-[#14613b] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#fff6dc] text-[#9a6100] dark:bg-[#ff8c00]/12 dark:text-[#ffc276]"}`}>
                      {answeredCorrectly ? challenge.successText : challenge.failText}
                    </div>
                  ) : null}

                  <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-[#14864e] transition hover:bg-[#e8f6ed] dark:text-[#72edb0] dark:hover:bg-white/[.06]" onClick={nextChallenge}>
                    <RefreshCcw className="size-4" />
                    {tr("Інше питання", "Another question")}
                  </button>
                </div>
              ) : (
                <div className="mt-6">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-[#f1f5f1] px-3 py-3 dark:bg-white/[.05]"><div className="text-[10px] font-black uppercase tracking-[.12em] text-[#7a887e]">{tr("Час", "Time")}</div><b className="mt-1 block text-lg">{reflexTimeLeft}{tr(" с", "s")}</b></div>
                    <div className="rounded-2xl bg-[#f1f5f1] px-3 py-3 dark:bg-white/[.05]"><div className="text-[10px] font-black uppercase tracking-[.12em] text-[#7a887e]">{tr("Очки", "Score")}</div><b className="mt-1 block text-lg">{reflexScore}</b></div>
                    <div className="rounded-2xl bg-[#f1f5f1] px-3 py-3 dark:bg-white/[.05]"><div className="text-[10px] font-black uppercase tracking-[.12em] text-[#7a887e]">{tr("Рекорд", "Best")}</div><b className="mt-1 block text-lg">{Math.max(reflexBest, reflexScore)}</b></div>
                  </div>

                  <div className="relative mt-4 h-44 overflow-hidden rounded-[26px] bg-[#edf3ed] ring-1 ring-[#142017]/8 dark:bg-[#0c130f] dark:ring-white/10">
                    {reflexTimeLeft > 0 ? (
                      <button
                        type="button"
                        onClick={handleReflexHit}
                        className="absolute grid size-12 place-items-center rounded-full bg-[#00ff88] text-xl text-[#061d10] shadow-[0_14px_30px_rgba(0,217,120,.24)] transition hover:scale-110"
                        style={{ left: `${reflexTargetPos.x}%`, top: `${reflexTargetPos.y}%`, transform: "translate(-50%, -50%)" }}
                        aria-label={tr("Натисни ціль", "Hit the target")}
                      >
                        🎯
                      </button>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                        <div className="text-lg font-black">{tr("Раунд завершено", "Round complete")}: {reflexScore}</div>
                        <div className="mt-2 text-sm font-bold text-[#66756b] dark:text-[#aab7ad]">{reflexBadge}</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-[#66756b] dark:text-[#aab7ad]">{tr("Натискай ціль, поки задача збирається.", "Hit the target while the task is being prepared.")}</p>
                    <button type="button" onClick={reflexTimeLeft > 0 ? moveReflexTarget : restartReflex} className="shrink-0 rounded-xl bg-[#17251c] px-3 py-2 text-xs font-black text-white dark:bg-[#edf6ef] dark:text-[#0d2115]">
                      {reflexTimeLeft > 0 ? tr("Змістити", "Shuffle") : tr("Ще раз", "Retry")}
                    </button>
                  </div>
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
