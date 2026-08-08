import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Layers3, Loader2, Radar, Sparkles } from "lucide-react";
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
    tr("Спочатку перевіряємо, щоб задача мала чіткий формат вводу й виводу — без цього автоперевірка буде нечіткою.", "First we verify that the task has clear input and output contracts — otherwise judging becomes vague."),
    tr("Паралельно готується стартовий шаблон: редактор відкриється вже в потрібній мові.", "The starter template is prepared in parallel: the editor will open in the right language."),
    tr("Для задач на межові випадки одразу закладаються тести на 0, 1, порожні дані або максимальні значення.", "For edge-case-heavy tasks, tests cover 0, 1, empty data, or maximum bounds."),
    tr("Якщо тема про змінні, задача повинна перевіряти саме роботу зі змінними, а не лише готовий текст у print.", "If the topic is about variables, the task should check variable usage, not just hardcoded print text."),
  ], [i18n.language]);

  const labItems = useMemo(() => [
    { title: tr("Контекст теми", "Topic context"), detail: tr("узгоджуємо з маршрутом", "matched to your route") },
    { title: tr("Умова", "Statement"), detail: tr("без старого checklist-стилю", "without old checklist feel") },
    { title: tr("Тести", "Tests"), detail: tr("публічні й приховані кейси", "public and hidden cases") },
    { title: tr("Шаблон", "Template"), detail: tr("готовий старт у редакторі", "ready in the editor") },
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
    const id = window.setInterval(() => setTipIndex((prev) => (prev + 1) % loadingTips.length), 5200);
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
      <div className="relative w-[min(900px,calc(100vw-28px))] overflow-hidden rounded-[34px] border border-white/10 bg-[#f7f9f6] text-[#142017] shadow-[0_35px_110px_rgba(0,0,0,.38)] dark:bg-[#101812] dark:text-[#eef6ef]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#00ff88]/16 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-[#ff8c00]/12 blur-3xl" />

        <div className="relative grid gap-0 lg:grid-cols-[1.08fr_.92fr]">
          <section className="min-w-0 p-6 sm:p-8">
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

              <div className="grid min-w-[104px] place-items-center rounded-2xl bg-white px-4 py-3 text-center shadow-sm ring-1 ring-[#142017]/10 dark:bg-white/[.06] dark:ring-white/10">
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#7a887e] dark:text-[#9eaca2]">{tr("Час", "Time")}</div>
                <div className="mt-1 flex min-w-[76px] justify-center text-2xl font-black tabular-nums tracking-[-.04em]">
                  <span>{elapsedSeconds}</span>
                  <span className="ml-1">{tr("с", "s")}</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-bold text-[#25342a] dark:text-[#eaf4ed]">{currentStepLabel}</span>
                <span className="shrink-0 font-black text-[#14864e] tabular-nums dark:text-[#72edb0]">{progressPercent}%</span>
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
                    <div key={step} className={`min-w-0 rounded-2xl px-3 py-3 transition ${current ? "bg-[#17251c] text-white shadow-[0_14px_34px_rgba(16,45,25,.18)] dark:bg-[#edf6ef] dark:text-[#0d2115]" : done ? "bg-[#e4f7ea] text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-white text-[#7a887e] ring-1 ring-[#142017]/8 dark:bg-white/[.045] dark:text-[#9eaca2] dark:ring-white/8"}`}>
                      <div className="text-[11px] font-black tabular-nums">{String(idx + 1).padStart(2, "0")}</div>
                      <div className="mt-1 truncate text-xs font-bold">{phaseSteps[step]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-[26px] border border-[#142017]/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.045]">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff4dd] text-[#d87500] dark:bg-[#ff8c00]/12 dark:text-[#ffbd73]">
                  <Radar className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[#d87500] dark:text-[#ffbd73]">{tr("Що зараз важливо", "What matters now")}</p>
                  <p className="mt-2 break-words text-sm leading-6 text-[#35443a] dark:text-[#d9e5dc]">{activeTip}</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="relative min-w-0 border-t border-[#142017]/10 bg-white/72 p-6 dark:border-white/10 dark:bg-white/[.035] lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[.14em] text-[#14864e] dark:text-[#72edb0]">
              {tr("Лабораторія генерації", "Generation lab")}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-black tracking-[-.05em]">
              {tr("Збираємо задачу як конструктор", "Assembling the task like a kit")}
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#637268] dark:text-[#a9b8ad]">
              {tr("Замість короткої гри тут видно, що саме готується: зміст, перевірки й робочий шаблон. Це не заглушка, а нормальний стан очікування.", "Instead of a tiny game, this shows what is being prepared: content, checks, and workspace template. It is a proper waiting state, not filler.")}
            </p>

            <div className="mt-6 overflow-hidden rounded-[26px] border border-[#142017]/10 bg-[#f3f7f2] p-4 dark:border-white/10 dark:bg-[#0d1510]">
              <div className="relative mb-4 h-24 overflow-hidden rounded-2xl bg-[#0f1a12]">
                <div className="absolute inset-x-5 top-1/2 h-px bg-[#00ff88]/35" />
                <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#00ff88]/35 bg-[#00ff88]/10 text-[#8bffc7]">
                  <Layers3 className="size-6" />
                </div>
                <div className="absolute top-0 h-full w-1/3 animate-[pulse_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#00ff88]/22 to-transparent" style={{ left: `${Math.min(64, safePhaseIndex * 16)}%` }} />
              </div>

              <div className="space-y-3">
                {labItems.map((item, idx) => {
                  const done = activePhase !== "error" && idx < safePhaseIndex;
                  const current = activePhase !== "error" && idx === Math.min(safePhaseIndex, labItems.length - 1);
                  return (
                    <div key={item.title} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-white/[.055]">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${done ? "bg-[#00d978] text-[#062211]" : current ? "bg-[#fff4dd] text-[#d87500]" : "bg-[#eef3ee] text-[#7a887e] dark:bg-white/[.08] dark:text-[#b4c1b8]"}`}>
                        {done ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#203029] dark:text-[#edf7f0]">{item.title}</span>
                        <span className="block truncate text-xs font-bold text-[#728076] dark:text-[#a9b8ad]">{item.detail}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
