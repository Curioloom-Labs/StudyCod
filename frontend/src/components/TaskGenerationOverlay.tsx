import React, { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../i18n";

export function TaskGenerationOverlay(props: { open: boolean }) {
  const { open } = props;
  const { i18n } = useTranslation();

  const steps = useMemo(() => {
    // Short, playful “terminal-ish” sequence. Keep it neutral and not misleading about exact backend steps.
    return [
      tr("Підбираю тему", "Picking a topic"),
      tr("Формулюю умову", "Drafting the statement"),
      tr("Перевіряю коректність", "Sanity-checking"),
      tr("Пакую шаблон коду", "Packing a starter template"),
      tr("Фінальні штрихи", "Final touches"),
    ];
  }, [i18n.language]);

  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      return;
    }
    const id = setInterval(() => {
      setStepIdx((v: number) => (v + 1) % steps.length);
    }, 1200);
    return () => clearInterval(id);
  }, [open, steps.length]);

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
                {tr("Зазвичай це займає 10–30 секунд", "Usually takes 10–30 seconds")}
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
            <span className="text-text-muted">$</span> {steps[stepIdx]}
            <span className="terminal-dots" />
          </div>

          <div className="mt-3 text-[11px] font-mono text-text-muted leading-relaxed">
            {tr(
              "Порада: якщо генерація зависла — онови сторінку і спробуй ще раз.",
              "Tip: if generation gets stuck, refresh the page and try again."
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
