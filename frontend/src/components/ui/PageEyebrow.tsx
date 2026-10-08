import React from "react";
import clsx from "classnames";

/** A quiet product label for page sections — intentionally independent of UI modes. */
export const PageEyebrow: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <span className={clsx("block text-xs font-semibold uppercase tracking-[0.14em] text-primary-strong dark:text-primary-soft", className)}>
    {label}
  </span>
);
