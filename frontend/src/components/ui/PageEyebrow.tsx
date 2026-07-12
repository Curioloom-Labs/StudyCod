import React from "react";
import clsx from "classnames";

/** A quiet product label for page sections — intentionally independent of UI modes. */
export const PageEyebrow: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <span className={clsx("block text-xs font-semibold uppercase tracking-[0.14em] text-[#147b47] dark:text-[#71edaf]", className)}>
    {label}
  </span>
);
