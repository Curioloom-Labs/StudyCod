import React from "react";
import clsx from "classnames";
import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { useUIMode } from "../interface/UIModeProvider";

export type PageHeroStat = {
  value: React.ReactNode;
  label: string;
  /** Colours the number; defaults to primary text. */
  tone?: "default" | "warn" | "error" | "success";
};

type PageHeroProps = {
  /** Code-style eyebrow shown in classic/focus/nova, e.g. "// class". */
  eyebrowClassic: string;
  /** Calm editorial eyebrow shown in Aurora, e.g. "Class". */
  eyebrowAurora: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: PageHeroStat[];
  /** Tailwind max-w token (without the `max-w-` prefix). */
  maxWidth?: "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  className?: string;
};

const toneClass: Record<NonNullable<PageHeroStat["tone"]>, string> = {
  default: "text-text-primary",
  warn: "text-accent-warning",
  error: "text-accent-error",
  success: "text-accent-success"
};

const toneText: Record<NonNullable<PageHeroStat["tone"]>, string> = {
  default: "text-text-secondary",
  warn: "text-accent-warning",
  error: "text-accent-error",
  success: "text-accent-success"
};

// Shared page header. Aurora is laconic by design: calm eyebrow, a moderate
// title (no display-size), and stats rendered as one quiet prose line (not a
// big-number grid) — matching the command-canvas language. Classic/focus/nova
// keep the original terminal styling with big inline numbers.
export const PageHero: React.FC<PageHeroProps> = ({
  eyebrowClassic,
  eyebrowAurora,
  title,
  subtitle,
  actions,
  stats,
  maxWidth = "6xl",
  className
}) => {
  const isAurora = useUIMode().mode === "aurora";
  const maxWidthClass =
    maxWidth === "7xl" ? "max-w-7xl"
    : maxWidth === "6xl" ? "max-w-6xl"
    : maxWidth === "5xl" ? "max-w-5xl"
    : maxWidth === "4xl" ? "max-w-4xl"
    : "max-w-3xl";

  return (
    <>
      <div className={clsx("px-4 md:px-8 mx-auto w-full", maxWidthClass, isAurora ? "pt-10 md:pt-16 pb-8" : "pt-8 pb-6", className)}>
        <motion.div variants={staggerContainer} initial="initial" animate="animate">
          {isAurora ? (
            <motion.span variants={fadeUpItem} className="block text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">{eyebrowAurora}</motion.span>
          ) : (
            <motion.span variants={fadeUpItem} className="block font-mono text-xs text-primary/70">{eyebrowClassic}</motion.span>
          )}

          <motion.div variants={fadeUpItem} className={clsx("flex flex-col lg:flex-row lg:items-end justify-between gap-4", isAurora ? "mt-2" : "mt-2")}>
            <div className="min-w-0">
              <h1 className={isAurora ? "text-2xl md:text-3xl font-semibold tracking-[-0.01em] text-text-primary" : "text-2xl md:text-3xl font-semibold tracking-tight text-text-primary"}>
                {title}
              </h1>
              {subtitle ? (
                <p className={isAurora ? "mt-2 text-[13px] text-text-secondary max-w-2xl" : "mt-1.5 text-sm text-text-secondary"}>{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
          </motion.div>

          {stats && stats.length ? (
            isAurora ? (
              // Laconic: one quiet prose line, no big-number tiles.
              <motion.div variants={fadeUpItem} className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-mono text-text-muted">
                {stats.map((s, i) => (
                  <span key={i} className="inline-flex items-baseline gap-1.5">
                    {i > 0 ? <span className="text-border mr-1.5">·</span> : null}
                    <span className={clsx("tabular-nums", toneText[s.tone ?? "default"])}>{s.value}</span>
                    <span>{s.label}</span>
                  </span>
                ))}
              </motion.div>
            ) : (
              <motion.div variants={fadeUpItem} className="flex flex-wrap items-baseline mt-5 gap-x-8 gap-y-3">
                {stats.map((s, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className={clsx("tabular-nums font-mono text-2xl md:text-3xl", toneClass[s.tone ?? "default"])}>
                      {s.value}
                    </span>
                    <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">
                      {s.label}
                    </span>
                  </div>
                ))}
              </motion.div>
            )
          ) : null}
        </motion.div>
      </div>

      {!isAurora ? <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" /> : null}
    </>
  );
};
