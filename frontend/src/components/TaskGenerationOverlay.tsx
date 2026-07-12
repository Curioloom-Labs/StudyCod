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
      className="fixed inset-0 z-[999] flex items-center justify-center bg-bg-base/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={tr("Генерація завдання", "Task generation")}
    >
      <div className="relative w-[min(520px,calc(100vw-32px))] overflow-hidden border border-border bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 border border-border bg-bg-code flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-mono text-text-primary truncate">
                {tr("Генерую нове завдання", "Generating a new task")}
                <span aria-hidden="true" className="inline-flex gap-1"><i className="size-1 rounded-full bg-current opacity-50" /><i className="size-1 rounded-full bg-current opacity-70" /><i className="size-1 rounded-full bg-current" /></span>
              </div>
              <div className="text-[11px] font-mono text-text-muted">
                {tr("Минає часу", "Elapsed time")}: {elapsedSeconds}{tr(" с", "s")}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse [animation-delay:150ms]" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
            </div>
          </div>

          {/* Shimmer bar */}
          <div className="relative mt-4 h-2 overflow-hidden border border-border bg-bg-code">
            <div
              className={`absolute inset-y-0 left-0 ${activePhase === "error" ? "bg-accent-error/70" : "bg-primary/70"} transition-all duration-500`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* “Terminal” body */}
        <div className="relative px-5 py-4 space-y-4">
          <div className="text-xs font-mono text-text-secondary">
            <span className="text-text-muted">$</span> {currentStepLabel}
            <span aria-hidden="true" className="inline-flex gap-1"><i className="size-1 rounded-full bg-current opacity-50" /><i className="size-1 rounded-full bg-current opacity-70" /><i className="size-1 rounded-full bg-current" /></span>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {PHASE_ORDER.map((step, idx) => {
              const done = activePhase !== "error" && idx < activePhaseIndex;
              const current = activePhase === step;
              return (
                <div
                  key={step}
                  className={`h-1.5 border ${current ? "border-primary/70 bg-primary/40" : done ? "border-primary/40 bg-primary/25" : "border-border bg-bg-code"}`}
                  aria-hidden
                />
              );
            })}
          </div>

          <div className="rounded-md border border-border bg-bg-code/80 px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-mono text-text-secondary">
              <Lightbulb className="w-3.5 h-3.5 text-primary" />
              {tr("Поки чекаємо", "While we wait")}
            </div>
            <div className="text-xs text-text-primary leading-relaxed">{activeTip}</div>
          </div>

          {challenge ? (
            <div className="rounded-md border border-border bg-bg-code/80 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-mono text-text-secondary">
                  {tr("Міні-ігри", "Mini games")}
                </div>
                <div className="inline-flex items-center gap-1 rounded border border-border p-1">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[10px] font-mono transition-fast ${miniGameMode === "quiz" ? "bg-primary/20 text-text-primary border border-primary/40" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
                    onClick={() => setMiniGameMode("quiz")}
                  >
                    {tr("Квіз", "Quiz")}
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[10px] font-mono transition-fast ${miniGameMode === "reflex" ? "bg-primary/20 text-text-primary border border-primary/40" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
                    onClick={() => setMiniGameMode("reflex")}
                  >
                    {tr("Реакція", "Reflex")}
                  </button>
                </div>
              </div>

              {miniGameMode === "quiz" ? (
                <>
                  <div className="mb-2 flex items-center justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
                      onClick={nextChallenge}
                    >
                      <RefreshCcw className="w-3 h-3" />
                      {tr("Інше питання", "Another question")}
                    </button>
                  </div>

                  <div className="text-xs text-text-primary mb-2">{challenge.question}</div>

                  <div className="flex flex-wrap gap-2">
                    {challenge.options.map((option, idx) => {
                      const selected = selectedOption === idx;
                      const correct = selectedOption !== null && idx === challenge.correctIndex;
                      const wrongSelected = selected && selectedOption !== challenge.correctIndex;
                      return (
                        <button
                          key={`${challengeIndex}-${idx}-${option}`}
                          type="button"
                          onClick={() => setSelectedOption(idx)}
                          className={`rounded border px-2 py-1 text-xs transition-fast ${
                            correct
                              ? "border-accent-success/70 bg-accent-success/10 text-text-primary"
                              : wrongSelected
                                ? "border-accent-error/70 bg-accent-error/10 text-text-primary"
                                : selected
                                  ? "border-primary/60 bg-primary/10 text-text-primary"
                                  : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {answeredCorrectly !== null ? (
                    <div className={`mt-2 text-[11px] font-mono ${answeredCorrectly ? "text-accent-success" : "text-accent-warn"}`}>
                      {answeredCorrectly ? challenge.successText : challenge.failText}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-text-secondary">
                    <span>{tr("Час", "Time")}: {reflexTimeLeft}{tr(" с", "s")}</span>
                    <span>{tr("Очки", "Score")}: {reflexScore}</span>
                    <span>{tr("Рекорд", "Best")}: {Math.max(reflexBest, reflexScore)}</span>
                  </div>

                  <div className="relative h-28 rounded border border-border bg-bg-base/70 overflow-hidden">
                    {reflexTimeLeft > 0 ? (
                      <button
                        type="button"
                        onClick={handleReflexHit}
                        className="absolute w-11 h-11 rounded-full border border-primary/60 bg-primary/20 text-lg flex items-center justify-center hover:scale-110 transition-fast"
                        style={{ left: `${reflexTargetPos.x}%`, top: `${reflexTargetPos.y}%`, transform: "translate(-50%, -50%)" }}
                        aria-label={tr("Натисни ціль", "Hit the target")}
                      >
                        🎯
                      </button>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-3">
                        <div className="text-xs font-mono text-text-primary">
                          {tr("Раунд завершено", "Round complete")}: {reflexScore}
                        </div>
                        <div className="text-[11px] font-mono text-text-secondary">{reflexBadge}</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-text-secondary">
                      {tr("Клікай по мішені, поки не вийшов час.", "Click the target before time runs out.")}
                    </div>
                    {reflexTimeLeft > 0 ? (
                      <button
                        type="button"
                        onClick={moveReflexTarget}
                        className="rounded border border-border px-2 py-1 text-[10px] font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
                      >
                        {tr("Перемістити", "Shuffle")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={restartReflex}
                        className="rounded border border-border px-2 py-1 text-[10px] font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
                      >
                        {tr("Ще раунд", "New round")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
