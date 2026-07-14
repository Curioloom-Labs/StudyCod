import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Lightbulb, Loader2, Sparkles } from "lucide-react";
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

export function TaskGenerationOverlay(props: { open: boolean; phase?: TaskGenerationPhase | null }) {
  const { open, phase } = props;
  const { i18n } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const phaseSteps = useMemo<Record<TaskGenerationPhase, string>>(() => ({
    requesting: tr("Надсилаю запит", "Sending request"),
    generating: tr("Збираю умову й тести", "Building statement and tests"),
    syncing: tr("Оновлюю список практики", "Refreshing practice list"),
    opening: tr("Відкриваю нове завдання", "Opening the new task"),
    finishing: tr("Готую робочий простір", "Preparing workspace"),
    error: tr("Генерація не завершилась", "Generation did not finish"),
  }), [i18n.language]);

  const loadingTips = useMemo<string[]>(() => [
    tr("Після відкриття задачі спершу прочитай вхідні й вихідні дані — це швидко прибирає половину помилок.", "When the task opens, read input and output first — it removes half of common mistakes."),
    tr("Перед першим запуском придумай один крайовий випадок: 0, 1, порожній список або максимальну межу.", "Before the first run, invent one edge case: 0, 1, empty list, or max bound."),
    tr("Якщо задача виглядає великою, спочатку зроби найпростіше правильне рішення, а оптимізацію залиш на другий прохід.", "If the task looks large, write the simplest correct solution first and optimize on the second pass."),
    tr("Формат виводу важливий: зайвий пробіл або перенос може зламати правильний алгоритм.", "Output format matters: an extra space or newline can break a correct algorithm."),
    tr("StudyCod зараз готує не лише текст, а й тести, шаблон коду та контекст теми.", "StudyCod is preparing the statement, tests, code template, and topic context."),
  ], [i18n.language]);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      setTipIndex(0);
      return;
    }
    const id = window.setInterval(() => setElapsedSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open || loadingTips.length === 0) return;
    const id = window.setInterval(() => setTipIndex((prev) => (prev + 1) % loadingTips.length), 5500);
    return () => window.clearInterval(id);
  }, [open, loadingTips.length]);

  if (!open) return null;

  const activePhase: TaskGenerationPhase = phase ?? "generating";
  const activePhaseIndex = PHASE_ORDER.indexOf(activePhase);
  const safePhaseIndex = Math.max(0, activePhaseIndex);
  const progressPercent = activePhase === "error"
    ? 100
    : Math.max(12, Math.round(((safePhaseIndex + 1) / PHASE_ORDER.length) * 100));
  const currentStepLabel = phaseSteps[activePhase];
  const activeTip = loadingTips[tipIndex] ?? loadingTips[0] ?? "";

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-[#07100a]/72 p-4 backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-label={tr("Генерація завдання", "Task generation")}
    >
      <div className="relative w-[min(860px,calc(100vw-28px))] overflow-hidden rounded-[34px] border border-white/10 bg-[#f7f9f6] text-[#142017] shadow-[0_35px_110px_rgba(0,0,0,.38)] dark:bg-[#101812] dark:text-[#eef6ef]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#00ff88]/16 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-[#ff8c00]/12 blur-3xl" />

        <div className="relative grid gap-0 lg:grid-cols-[1.12fr_.88fr]">
          <section className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#17251c] text-[#6ef1af] shadow-[0_18px_45px_rgba(13,42,23,.22)] dark:bg-[#edf6ef] dark:text-[#0d2115]">
                  {activePhase === "error" ? <Sparkles className="size-6" /> : <Loader2 className="size-6 animate-spin" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#14864e] dark:text-[#72edb0]">
                    {tr("Створення практики", "Practice generation")}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em] sm:text-4xl">
                    {activePhase === "error"
                      ? tr("Не вдалося завершити", "Could not finish")
                      : tr("Готуємо нове завдання", "Preparing a new task")}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#637268] dark:text-[#a9b8ad]">
                    {activePhase === "error"
                      ? tr("Запит зупинився. Закрий це вікно й спробуй ще раз — робочий простір залишився на місці.", "The request stopped. Close this window and try again — your workspace stayed intact.")
                      : tr("Синхронізуємо тему, складність, тести та стартовий шаблон. Коли все буде готово, задача відкриється автоматично.", "Syncing topic, difficulty, tests, and starter template. The task opens automatically when ready.")}
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
                  const done = activePhase !== "error" && idx < safePhaseIndex;
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

          <aside className="relative border-t border-[#142017]/10 bg-white/72 p-6 dark:border-white/10 dark:bg-white/[.035] lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[.14em] text-[#14864e] dark:text-[#72edb0]">
              {tr("Що відбувається", "What is happening")}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-black tracking-[-.05em]">
              {tr("Не гра, а підготовка задачі", "Not a game, actual preparation")}
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#637268] dark:text-[#a9b8ad]">
              {tr("Ми прибрали короткий квіз із цього екрана: він швидко закінчувався й виглядав як заглушка. Тепер тут лише корисний статус.", "The short quiz was removed from this screen: it ended too quickly and felt like filler. This panel now shows only useful status.")}
            </p>

            <div className="mt-6 space-y-3">
              {[
                tr("Підбираємо тему й рівень складності", "Choosing topic and difficulty"),
                tr("Генеруємо умову без зайвого шуму", "Generating a clear statement"),
                tr("Створюємо тести для перевірки", "Creating validation tests"),
                tr("Готуємо стартовий код", "Preparing starter code"),
              ].map((item, idx) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#f0f5f0] px-4 py-3 dark:bg-white/[.055]">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${idx <= safePhaseIndex ? "bg-[#00d978] text-[#062211]" : "bg-white text-[#7a887e] dark:bg-white/[.08] dark:text-[#b4c1b8]"}`}>
                    {idx < safePhaseIndex ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                  </span>
                  <span className="text-sm font-bold text-[#304038] dark:text-[#dce7df]">{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
