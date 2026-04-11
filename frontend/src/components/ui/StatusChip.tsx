import React from "react";
import clsx from "classnames";

export type StatusChipTone = "success" | "warn" | "error" | "info" | "primary" | "neutral";

type Props = {
  glyph?: React.ReactNode;
  label: React.ReactNode;
  tone?: StatusChipTone;
  size?: "sm" | "md";
  className?: string;
};

export const StatusChip: React.FC<Props> = ({
  glyph,
  label,
  tone = "neutral",
  size = "sm",
  className,
}) => {
  const toneClasses: Record<StatusChipTone, string> = {
    success: "border-accent-success/40 bg-accent-success/10 text-accent-success",
    warn: "border-accent-warning/40 bg-accent-warning/10 text-accent-warning",
    error: "border-accent-error/40 bg-accent-error/10 text-accent-error",
    info: "border-secondary/40 bg-secondary/12 text-secondary",
    primary: "border-primary/40 bg-primary/10 text-primary",
    neutral: "border-border bg-bg-code text-text-secondary",
  };

  const sizeClasses = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";

  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md border font-mono", toneClasses[tone], sizeClasses, className)}>
      {glyph ? <span>{glyph}</span> : null}
      <span>{label}</span>
    </span>
  );
};
