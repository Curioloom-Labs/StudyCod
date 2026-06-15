import React from "react";
import clsx from "classnames";
import { useTranslation } from "react-i18next";
import { useUIMode } from "../interface/UIModeProvider";
import { availableUIModes, type UIMode } from "../../lib/uiMode";

const MODE_LABELS: Record<UIMode, string> = {
  focus: "Momentum",
  classic: "Classic",
  nova: "Nova",
  aurora: "Aurora"
};
const MODE_ORDER: UIMode[] = ["focus", "classic", "nova", "aurora"];

/**
 * Inline UI-version switcher — lets the user flip between StudyCod UI versions
 * straight from the home screen (not only from Profile). Lightweight pills, no
 * heavy chrome; reads/writes the shared UIModeProvider preference.
 */
export const UIModeSwitch: React.FC<{ className?: string; label?: boolean }> = ({ className, label = true }) => {
  const ui = useUIMode();
  const { t } = useTranslation();
  const allowed = availableUIModes();
  const modes = MODE_ORDER.filter((m) => allowed.includes(m));

  return (
    <div className={clsx("flex flex-wrap items-center gap-2", className)}>
      {label ? (
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">
          {t("interfaceLabel", { defaultValue: "Interface" })}
        </span>
      ) : null}
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-bg-surface/60 p-1" role="group" aria-label={t("interfaceLabel", { defaultValue: "Interface" })}>
        {modes.map((m) => {
          const active = ui.mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => ui.setMode(m)}
              aria-pressed={active}
              className={clsx(
                "px-3 h-7 rounded-full text-xs font-mono font-medium tracking-[0.02em] transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                active ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
};
