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
  const base = "relative overflow-hidden rounded-xl border border-border transition-fast ease-out";
  const chrome = "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_40px_rgba(0,0,0,0.45)]";
  const surface = variant === "inset" ? "bg-bg-base" : variant === "panel" ? "bg-bg-surface/60" : "bg-bg-surface";
  const overlay = "before:absolute before:inset-0 before:pointer-events-none before:opacity-80 " + "before:bg-[radial-gradient(circle_at_20%_0%,rgba(0,255,136,0.10),transparent_42%),radial-gradient(circle_at_100%_20%,rgba(91,159,255,0.08),transparent_38%)] " + "after:absolute after:inset-0 after:pointer-events-none after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";
  return <div {...rest} className={clsx(base, chrome, surface, overlay, className)}>
      <div className="relative">{children}</div>
    </div>;
};