import React from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
type State = "idle" | "evaluating" | "success" | "error" | "logic-warning";
interface Props {
  state: State;
  message?: string;
  className?: string;
}
export const StateIndicator: React.FC<Props> = ({
  state,
  message,
  className
}) => {
  const {
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  if (state === "idle") return null;
  const config = {
    evaluating: {
      icon: Loader2,
      color: "text-secondary",
      bg: "bg-secondary/10",
      border: "border-secondary",
      message: message || tr("Оцінювання…", "Evaluating…")
    },
    success: {
      icon: CheckCircle2,
      color: "text-accent-success",
      bg: "bg-accent-success/10",
      border: "border-accent-success",
      message: message || tr("Успішно", "Success")
    },
    error: {
      icon: XCircle,
      color: "text-accent-error",
      bg: "bg-accent-error/10",
      border: "border-accent-error",
      message: message || tr("Помилка", "Error")
    },
    "logic-warning": {
      icon: AlertTriangle,
      color: "text-accent-logic-warning",
      bg: "bg-accent-logic-warning/10",
      border: "border-accent-logic-warning",
      message: message || tr("Попередження", "Warning")
    }
  };
  const {
    icon: Icon,
    color,
    bg,
    border,
    message: displayMessage
  } = config[state];
  return <div
    role={state === "error" ? "alert" : "status"}
    aria-live={state === "error" ? "assertive" : "polite"}
    aria-atomic="true"
    aria-busy={state === "evaluating"}
    className={`inline-flex items-center gap-2 px-3 py-1.5 border text-xs font-mono ${color} ${bg} ${border} ${className || ""} ${state === "evaluating" ? "animate-pulse" : ""}`}>
      <Icon aria-hidden="true" className={`w-3 h-3 ${state === "evaluating" ? "animate-spin" : ""}`} />
      <span>{displayMessage}</span>
    </div>;
};
