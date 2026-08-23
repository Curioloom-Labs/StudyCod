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
  const base = "inline-flex select-none items-center justify-center rounded-xl font-semibold leading-[1.35] tracking-[-0.01em] transition-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-45 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[.97] touch-manipulation";
  const sizes: Record<string, string> = {
    sm: "min-h-10 px-3 py-2 text-[0.75rem]",
    md: "min-h-11 px-4 py-2.5 text-[0.875rem]",
    lg: "min-h-12 px-5 py-3 text-[1rem]"
  };
  const variants: Record<string, string> = {
    primary: "bg-primary text-[#062112] shadow-[0_12px_24px_-16px_rgba(0,255,136,.8)] hover:bg-primary-hover active:bg-primary-muted",
    secondary: "bg-[#1b2b20] text-[#eff7f1] shadow-[0_12px_24px_-18px_rgba(0,0,0,.45)] hover:bg-[#273a2c] dark:bg-[#edf4ef] dark:text-[#0b130e] dark:hover:bg-white",
    ghost: "border border-border bg-bg-surface/75 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
  };
  return <button type={type} className={clsx(base, sizes[size], variants[variant], className)} {...props} />;
};
