import React from "react";
import clsx from "classnames";
import { useUIMode } from "../interface/UIModeProvider";

/**
 * Section eyebrow that renders the terminal `// label` style in classic/focus/
 * nova, and a calm, laconic uppercase label in Aurora — so every page header
 * reads consistently in the Aurora version without per-page styling drift.
 *
 * Pass the bare label (no `// `): classic adds the slashes + lowercases,
 * Aurora shows it spaced and muted.
 */
export const PageEyebrow: React.FC<{ label: string; className?: string }> = ({ label, className }) => {
  const isAurora = useUIMode().mode === "aurora";
  if (isAurora) {
    return (
      <span className={clsx("block text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted", className)}>
        {label}
      </span>
    );
  }
  return (
    <span className={clsx("block font-mono text-xs text-primary/70", className)}>
      {`// ${label.toLowerCase()}`}
    </span>
  );
};
