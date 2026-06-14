import React from "react";
import clsx from "classnames";
interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}
export const Button: React.FC<Props> = ({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}) => {
  const base = "inline-flex items-center justify-center rounded-[var(--ui-button-radius)] font-mono font-medium leading-[1.35] tracking-[0.01em] transition-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transform-gpu motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] touch-manipulation";
  const sizes: Record<string, string> = {
    sm: "min-h-10 px-3 py-2 text-[0.75rem]",
    md: "min-h-11 px-4 py-2.5 text-[0.875rem]",
    lg: "min-h-12 px-5 py-3 text-[1rem]"
  };
  const variants: Record<string, string> = {
    primary: "border border-primary text-primary hover:bg-primary/12 active:bg-primary/16",
    secondary: "border border-secondary text-secondary hover:bg-secondary/12 active:bg-secondary/16",
    ghost: "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-hover"
  };
  return <button type={type} className={clsx(base, sizes[size], variants[variant], className)} {...props} />;
};
