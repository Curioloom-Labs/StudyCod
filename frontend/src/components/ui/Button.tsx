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
  ...props
}) => {
  const base = "inline-flex items-center justify-center text-sm font-mono transition-fast ease-out focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed transform-gpu will-change-transform hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]";
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base"
  };
  const variants: Record<string, string> = {
    primary: "border border-primary text-primary hover:bg-primary hover:text-bg-base active:bg-primary active:text-bg-base",
    secondary: "border border-secondary text-secondary hover:bg-secondary hover:text-bg-base active:bg-secondary active:text-bg-base",
    ghost: "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-hover"
  };
  return <button className={clsx(base, sizes[size], variants[variant], className)} {...props} />;
};