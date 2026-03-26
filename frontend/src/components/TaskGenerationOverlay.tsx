import React, { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../i18n";

export type TaskGenerationPhase =
  | "requesting"
  | "generating"
  | "syncing"
  | "opening"
  | "finishing"
  | "error";

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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds((v: number) => v + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  const activePhase: TaskGenerationPhase = phase ?? "generating";
  const currentStepLabel = phaseSteps[activePhase];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={tr("Генерація завдання", "Task generation")}
    >
      <div className="relative w-[min(520px,calc(100vw-32px))] overflow-hidden border border-border bg-bg-surface shadow-2xl">
        {/* Glow + flicker */}
        <div className="absolute inset-0 terminal-glow pointer-events-none" />
        <div className="absolute inset-0 terminal-flicker pointer-events-none" />

        {/* Scanline */}
        <div className="absolute -top-24 left-0 right-0 h-24 terminal-scanline pointer-events-none" />

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 border border-border bg-bg-code flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-mono text-text-primary truncate">
                {tr("Генерую нове завдання", "Generating a new task")}
                <span className="terminal-dots" />
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
            <div className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* “Terminal” body */}
        <div className="relative px-5 py-4">
          <div className="text-xs font-mono text-text-secondary">
            <span className="text-text-muted">$</span> {currentStepLabel}
            <span className="terminal-dots" />
          </div>
        </div>
      </div>
    </div>
  );
}
