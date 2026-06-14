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
    success: "border border-accent-success/60 bg-accent-success/10 text-accent-success",
    warn: "border border-accent-warn/60 bg-accent-warn/10 text-accent-warn",
    error: "border border-accent-error/60 bg-accent-error/10 text-accent-error",
    "logic-warning": "border border-accent-logic-warning/60 bg-accent-logic-warning/10 text-accent-logic-warning",
    info: "border border-secondary/60 bg-secondary/10 text-secondary"
  };
  return <span className={clsx("inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-[var(--ui-badge-radius)]", colors[color])}>
      {children}
    </span>;
};
