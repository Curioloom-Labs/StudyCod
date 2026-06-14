import React from "react";
import clsx from "classnames";
import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

/**
 * Editorial list primitives for the Aurora UI version. Pages render these
 * (gated on `ui.mode === "aurora"`) so switching to Aurora visibly recomposes
 * their bodies into quiet, typographic, hairline-divided lists instead of
 * heavy card grids — without disturbing the classic/focus/nova layouts.
 */

export const AuroraSection: React.FC<{
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, actions, children, className }) => (
  <section className={clsx("space-y-4", className)}>
    {title || actions ? (
      <div className="flex items-baseline justify-between gap-3">
        {title ? <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">{title}</h2> : <span />}
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    ) : null}
    {children}
  </section>
);

export const AuroraList: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Disable the entrance stagger (e.g. nested lists). */
  static?: boolean;
}> = ({ children, className, static: noMotion }) => {
  const cls = clsx(
    "rounded-[var(--aurora-radius)] border border-border bg-bg-surface/50 overflow-hidden divide-y divide-border",
    className
  );
  if (noMotion) return <div className={cls}>{children}</div>;
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className={cls}>
      {children}
    </motion.div>
  );
};

export type AuroraRowTone = "default" | "success" | "warn" | "error" | "primary";

const trailingToneClass: Record<AuroraRowTone, string> = {
  default: "text-text-secondary",
  success: "text-accent-success",
  warn: "text-accent-warn",
  error: "text-accent-error",
  primary: "text-primary"
};

export const AuroraRow: React.FC<{
  title: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingTone?: AuroraRowTone;
  onClick?: () => void;
  className?: string;
}> = ({ title, meta, leading, trailing, trailingTone = "default", onClick, className }) => {
  const inner = (
    <>
      {leading ? <span className="shrink-0 flex items-center text-text-muted">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-text-primary truncate group-hover:text-primary transition-fast">{title}</span>
        {meta ? <span className="mt-0.5 block text-[11px] font-mono text-text-muted truncate">{meta}</span> : null}
      </span>
      {trailing ? (
        <span className={clsx("shrink-0 text-sm font-mono tabular-nums", trailingToneClass[trailingTone])}>{trailing}</span>
      ) : null}
    </>
  );

  const base = "group w-full flex items-center gap-4 px-5 py-4 text-left transition-fast";

  if (onClick) {
    return (
      <motion.button
        variants={fadeUpItem}
        onClick={onClick}
        className={clsx(base, "hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40", className)}
      >
        {inner}
      </motion.button>
    );
  }
  return <motion.div variants={fadeUpItem} className={clsx(base, className)}>{inner}</motion.div>;
};
