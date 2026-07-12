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
  const base = "rounded-2xl border border-border/80 transition-fast ease-out";
  const chrome = "shadow-[0_18px_42px_-34px_rgba(3,20,10,.6)]";
  const surface = variant === "inset" ? "bg-bg-code/70" : variant === "panel" ? "bg-bg-surface/82 backdrop-blur-sm" : "bg-bg-surface";
  return <div {...rest} className={clsx(base, chrome, surface, className)}>{children}</div>;
};
