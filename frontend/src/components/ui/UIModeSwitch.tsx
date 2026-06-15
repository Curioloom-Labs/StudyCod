import React from "react";
import clsx from "classnames";
import { useTranslation } from "react-i18next";
import { useUIMode } from "../interface/UIModeProvider";
import type { UIMode } from "../../lib/uiMode";

const MODES: Array<{ id: UIMode; label: string }> = [
  { id: "focus", label: "Momentum" },
  { id: "classic", label: "Classic" },
  { id: "nova", label: "Nova" },
  { id: "aurora", label: "Aurora" }
];

/**
 * Inline UI-version switcher — lets the user flip between StudyCod UI versions
 * straight from the home screen (not only from Profile). Lightweight pills, no
 * heavy chrome; reads/writes the shared UIModeProvider preference.
 */
export const UIModeSwitch: React.FC<{ className?: string; label?: boolean }> = ({ className, label = true }) => {
  const ui = useUIMode();
  const { t } = useTranslation();

  return (
    <div className={clsx("flex flex-wrap items-center gap-2", className)}>
      {label ? (
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">
          {t("interfaceLabel", { defaultValue: "Interface" })}
        </span>
      ) : null}
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-bg-surface/60 p-1" role="group" aria-label={t("interfaceLabel", { defaultValue: "Interface" })}>
        {MODES.map((m) => {
          const active = ui.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => ui.setMode(m.id)}
              aria-pressed={active}
              className={clsx(
                "px-3 h-7 rounded-full text-xs font-mono font-medium tracking-[0.02em] transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                active ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
