import React from "react";
import clsx from "classnames";
interface Props {
  children: React.ReactNode;
  color?: "success" | "warn" | "error" | "info" | "logic-warning";
}
export const Badge: React.FC<Props> = ({
  children,
  color = "info"
}) => {
  const colors: Record<string, string> = {
    success: "border border-accent-success text-accent-success",
    warn: "border border-accent-warn text-accent-warn",
    error: "border border-accent-error text-accent-error",
    "logic-warning": "border border-accent-logic-warning text-accent-logic-warning",
    info: "border border-secondary text-secondary"
  };
  return <span className={clsx("inline-flex items-center px-2 py-0.5 text-xs font-mono border", colors[color])}>
      {children}
    </span>;
};