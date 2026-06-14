import React from "react";
import clsx from "classnames";
type CardVariant = "default" | "panel" | "inset";
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
}> = ({
  children,
  className,
  variant = "default",
  ...rest
}) => {
  const base = "rounded-[var(--ui-card-radius)] border border-border transition-fast ease-out";
  const chrome = "shadow-[var(--ui-card-shadow)]";
  const surface = variant === "inset" ? "bg-bg-base" : variant === "panel" ? "bg-bg-surface/80" : "bg-bg-surface";
  return <div {...rest} className={clsx(base, chrome, surface, className)}>{children}</div>;
};
