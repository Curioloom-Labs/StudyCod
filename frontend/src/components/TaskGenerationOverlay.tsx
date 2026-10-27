import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Layers3, Loader2, Radar, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../i18n";

export type TaskGenerationPhase =
  | "requesting"
  | "context"
  | "generating"
  | "condition"
  | "tests"
  | "saving"
  | "ready"
  | "syncing"
  | "opening"
  | "finishing"
  | "error";

export type TaskGenerationProgress = {
  status: "running" | "ready" | "error";
  phase: "requesting" | "context" | "condition" | "tests" | "saving" | "ready" | "error";
  progress: number;
  message: string;
  updatedAt: string;
};

const PHASE_ORDER: TaskGenerationPhase[] = [
  "requesting",
  "context",
  "condition",
  "tests",
  "saving",
];

export function TaskGenerationOverlay({
  open,
  phase,
  progress,
  mode = "task",
}: {
  open: boolean;
  phase?: TaskGenerationPhase | null;
  progress?: TaskGenerationProgress | null;
  mode?: "task" | "assessment";
}) {
  const { i18n } = useTranslation();
  const isAssessment = mode === "assessment";
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const phaseSteps = useMemo<Record<TaskGenerationPhase, string>>(
    () => isAssessment
      ? {
          requesting: tr("Надсилаємо запит", "Sending request"),
          context: tr("Зіставляємо прогрес курсу", "Checking your course progress"),
          generating: tr("Генеруємо персональний тест", "Building your personal assessment"),
          condition: tr("Готуємо питання ABCD", "Preparing ABCD questions"),
          tests: tr("Створюємо практичні задачі", "Creating practical tasks"),
          saving: tr("Зберігаємо діагностику", "Saving your assessment"),
          ready: tr("Тест готовий", "Assessment is ready"),
          syncing: tr("Оновлюємо персональний маршрут", "Updating your learning route"),
          opening: tr("Відкриваємо тест", "Opening the assessment"),
          finishing: tr("Готуємо діагностику", "Preparing your assessment"),
          error: tr("Не вдалося створити тест", "Could not create the assessment"),
        }
      : {
          requesting: tr("Надсилаємо запит", "Sending request"),
          context: tr("Узгоджуємо контекст теми", "Loading topic context"),
          generating: tr("Створюємо умову", "Building the statement"),
          condition: tr("Створюємо умову", "Building the statement"),
          tests: tr("Перевіряємо тести", "Preparing autotests"),
          saving: tr("Зберігаємо результат", "Saving the result"),
          ready: tr("Практика готова", "Practice is ready"),
          syncing: tr("Оновлюємо маршрут практики", "Refreshing your practice route"),
          opening: tr("Відкриваємо нове завдання", "Opening the new task"),
          finishing: tr("Готуємо робочий простір", "Preparing your workspace"),
          error: tr("Генерація не завершилась", "Generation did not finish"),
        },
    [i18n.language, isAssessment],
  );

  const loadingTips = useMemo(
    () => isAssessment ? [
      tr(
        "Враховуємо теми, які ти вже опанував, щоб не перевіряти їх повторно.",
        "We account for topics you have already mastered so you do not repeat them.",
      ),
      tr(
        "Питання з різних тем допоможуть точніше визначити, що вже можна зарахувати.",
        "Questions across the course help us identify which topics can be credited.",
      ),
      tr(
        "Задачі доповнять тест і покажуть, як ти застосовуєш знання з різних тем.",
        "Practical tasks complement the quiz and show how you apply knowledge across topics.",
      ),
    ] : [
      tr(
        "Перевіряємо, щоб умова мала чіткий формат вводу та виводу — так автоперевірка буде надійною.",
        "We check that the task has a clear input/output contract so automated checks stay reliable.",
      ),
      tr(
        "Стартовий шаблон готується паралельно: редактор відкриється одразу потрібною мовою.",
        "The starter template is prepared in parallel and the editor will open in the right language.",
      ),
      tr(
        "Для крайових випадків одразу додаємо тести на порожні дані, 0, 1 та максимальні значення.",
        "Edge cases include empty data, 0, 1, and maximum values where they matter.",
      ),
    ],
    [i18n.language, isAssessment],
  );

  const labItems = useMemo(
    () => isAssessment ? [
      { title: tr("Прогрес курсу", "Course progress"), detail: tr("визначаємо теми для перевірки", "choosing topics to assess") },
      { title: tr("Питання ABCD", "ABCD questions"), detail: tr("готуємо унікальний набір", "building a unique set") },
      { title: tr("Практика", "Practical tasks"), detail: tr("для модулів курсу", "across course modules") },
      { title: tr("Твій тест", "Your assessment"), detail: tr("збираємо персональний варіант", "assembling your version") },
    ] : [
      { title: tr("Контекст теми", "Topic context"), detail: tr("узгоджуємо з маршрутом", "matched to your route") },
      { title: tr("Умова", "Statement"), detail: tr("формуємо зрозумілий формат", "clear input and output") },
      { title: tr("Тести", "Tests"), detail: tr("публічні та приховані кейси", "public and hidden cases") },
      { title: tr("Шаблон", "Template"), detail: tr("готуємо старт у редакторі", "ready in the editor") },
    ],
    [i18n.language, isAssessment],
  );

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      setTipIndex(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open || loadingTips.length < 2) return;
    const timer = window.setInterval(
      () => setTipIndex((value) => (value + 1) % loadingTips.length),
      5200,
    );
    return () => window.clearInterval(timer);
  }, [open, loadingTips.length]);

  if (!open) return null;

  const activePhase = phase ?? progress?.phase ?? "generating";
  const phaseForIndex = activePhase === "generating" || activePhase === "syncing"
    ? activePhase === "syncing" ? "saving" : "condition"
    : activePhase === "opening" || activePhase === "finishing"
      ? "saving"
      : activePhase === "ready"
        ? "saving"
      : activePhase;
  const activeIndex = Math.max(0, PHASE_ORDER.indexOf(phaseForIndex));
  const progressValue = progress?.progress ?? (activePhase === "error"
    ? 100
    : Math.max(5, Math.round(((activeIndex + 1) / PHASE_ORDER.length) * 100)));
  const hasDeterminateProgress = !isAssessment || Boolean(progress) || activePhase === "error";
  const activeTip = loadingTips[tipIndex] ?? loadingTips[0];
  const activeMessage = progress?.message?.trim() || phaseSteps[activePhase];

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-bg-base/80 p-4 backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-label={isAssessment ? tr("Генерація діагностичного тесту", "Diagnostic assessment generation") : tr("Генерація завдання", "Task generation")}
    >
      <div className="relative w-[min(900px,calc(100vw-28px))] overflow-hidden rounded-[28px] border border-border bg-bg-surface text-text-primary shadow-[0_35px_110px_rgba(0,0,0,.42)]">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-64 rounded-full bg-accent-warn/10 blur-3xl" />

        <div className="relative grid gap-0 lg:grid-cols-[1.08fr_.92fr]">
          <section className="min-w-0 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                  {activePhase === "error" ? <Sparkles className="size-6" /> : <Loader2 className="size-6 animate-spin" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">
                    {isAssessment ? tr("Персональна діагностика", "Personal assessment") : tr("Створення практики", "Practice generation")}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.06em] sm:text-4xl">
                    {activePhase === "error"
                      ? tr("Не вдалося завершити", "Could not finish")
                      : isAssessment ? tr("Формуємо тест знань", "Preparing your knowledge check") : tr("Готуємо нове завдання", "Preparing a new task")}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
                    {activePhase === "error"
                      ? tr("Запит зупинився. Закрий це вікно та спробуй ще раз — робочий простір залишився на місці.", "The request stopped. Close this window and try again — your workspace is still intact.")
                      : isAssessment
                        ? tr("Генеруємо унікальні питання ABCD і практичні задачі за всіма темами курсу.", "We are generating unique ABCD questions and practical tasks across the full course.")
                        : tr("Синхронізуємо тему, складність, тести та стартовий шаблон. Коли все буде готово, завдання відкриється автоматично.", "We are syncing the topic, difficulty, tests, and starter template. The task will open automatically when ready.")}
                  </p>
                </div>
              </div>

              <div className="grid min-w-[104px] place-items-center rounded-2xl border border-border bg-bg-base px-4 py-3 text-center">
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-text-muted">{tr("Час", "Time")}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums tracking-[-.04em]">{elapsedSeconds}{tr(" с", "s")}</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-semibold">{activeMessage}</span>
                <span className="shrink-0 font-bold text-primary tabular-nums">{hasDeterminateProgress ? `${progressValue}%` : tr("Усі теми", "Full course")}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-bg-hover" role="progressbar" aria-valuemin={hasDeterminateProgress ? 0 : undefined} aria-valuemax={hasDeterminateProgress ? 100 : undefined} aria-valuenow={hasDeterminateProgress ? progressValue : undefined} aria-valuetext={hasDeterminateProgress ? `${progressValue}%` : tr("Генеруємо оцінювання з усіх тем курсу", "Generating an assessment across the full course")}>
                {hasDeterminateProgress
                  ? <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${activePhase === "error" ? "bg-accent-error" : "bg-primary"}`} style={{ width: `${progressValue}%` }} />
                  : <div className="h-full w-1/3 animate-shimmer rounded-full bg-primary" />}
              </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {PHASE_ORDER.map((step, index) => {
                  const done = activePhase !== "error" && index < activeIndex;
                  const current = phaseForIndex === step;
                  return (
                    <div key={step} className={`min-w-0 rounded-xl px-3 py-3 transition ${current ? "bg-primary text-primary-foreground" : done ? "bg-accent-success/10 text-primary" : "bg-bg-base text-text-muted border border-border"}`}>
                      <div className="text-[11px] font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</div>
                      <div className="mt-1 truncate text-xs font-semibold">{phaseSteps[step]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-bg-base p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-warn/10 text-accent-warn"><Radar className="size-5" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Що зараз важливо", "What matters now")}</p>
                  <p className="mt-2 break-words text-sm leading-6 text-text-secondary">{activeTip}</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="relative min-w-0 border-t border-border bg-bg-base/70 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{isAssessment ? tr("Діагностична лабораторія", "Assessment lab") : tr("Лабораторія генерації", "Generation lab")}</p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.05em]">{isAssessment ? tr("Збираємо тест під твій маршрут", "Building an assessment for your route") : tr("Збираємо задачу як конструктор", "Assembling the task")}</h3>
            <p className="mt-3 text-sm leading-6 text-text-secondary">{isAssessment ? tr("Підбираємо теми, питання та практичне завдання. Поки тест готується, видно кожен крок.", "We are selecting topics, questions, and a practical task. Follow each step while the assessment is prepared.") : tr("Тут видно, що саме готується: зміст, перевірки та робочий шаблон. Це зрозумілий стан очікування, а не порожній екран.", "This makes the waiting state clear: content, checks, and the workspace template are being prepared.")}</p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-bg-code p-4">
              <div className="relative mb-4 h-24 overflow-hidden rounded-xl bg-bg-code">
                <div className="absolute inset-x-5 top-1/2 h-px bg-primary/35" />
                <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-primary/35 bg-primary/10 text-primary"><Layers3 className="size-6" /></div>
                <div className="absolute top-0 h-full w-1/3 animate-[pulse_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/25 to-transparent" style={{ left: `${Math.min(64, activeIndex * 16)}%` }} />
              </div>

              <div className="space-y-3">
                {labItems.map((item, index) => {
                  const labStepIndex = index + 1;
                  const done = activePhase !== "error" && activeIndex > labStepIndex;
                  const current = activePhase !== "error" && activeIndex === labStepIndex;
                  return (
                    <div key={item.title} className="flex min-w-0 items-center gap-3 rounded-xl bg-bg-surface px-4 py-3">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${done ? "bg-primary text-primary-foreground" : current ? "bg-accent-warn/10 text-accent-warn" : "bg-bg-hover text-text-muted"}`}>
                        {done ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                      </span>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-text-muted">{item.detail}</span></span>
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
