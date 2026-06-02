import React, { useState } from "react";
import { tr } from "../i18n";
import { Button } from "./ui/Button";
import { explainTaskError, type ExplainErrorFailure } from "../lib/api/tasks";

type Props = {
  language: "JAVA" | "PYTHON" | "CPP";
  code: string;
  verdict?: string | null;
  stderr?: string | null;
  taskTitle?: string;
  taskText?: string;
  failures?: ExplainErrorFailure[];
  className?: string;
};

/**
 * On-demand "Explain my error" button. Shown after a failed run; on click it
 * asks the backend for a plain-language explanation (works for compile /
 * runtime / TLE / wrong answer) and renders it inline. Pedagogically guarded
 * server-side to never reveal a full solution.
 */
export const ErrorExplainButton: React.FC<Props> = (props) => {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const code = String(props.code ?? "");
  if (!code.trim()) return null;

  const run = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await explainTaskError({
        language: props.language,
        code,
        verdict: props.verdict ?? undefined,
        stderr: props.stderr ?? undefined,
        taskTitle: props.taskTitle,
        taskText: props.taskText,
        failures: props.failures,
      });
      setExplanation(res.explanation);
    } catch {
      setErrorMsg(tr("Не вдалося отримати пояснення. Спробуй ще раз трохи згодом.", "Couldn't get an explanation. Please try again shortly."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={props.className}>
      {!explanation && (
        <Button variant="secondary" size="sm" onClick={run} disabled={loading} aria-busy={loading}>
          {loading
            ? tr("Аналізую…", "Analyzing…")
            : tr("💡 Поясни помилку (AI)", "💡 Explain my error (AI)")}
        </Button>
      )}

      {errorMsg && (
        <div className="mt-2 text-xs font-mono text-secondary">{errorMsg}</div>
      )}

      {explanation && (
        <div className="mt-3 rounded-lg border border-border bg-bg-hover/40 p-3">
          <div className="text-[10px] font-mono text-primary mb-1">
            {tr("💡 Пояснення помилки", "💡 Error explanation")}
          </div>
          <p className="text-xs font-mono text-text-primary whitespace-pre-wrap leading-relaxed">
            {explanation}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
              {loading ? tr("Аналізую…", "Analyzing…") : tr("Пояснити ще раз", "Explain again")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExplanation(null)}>
              {tr("Сховати", "Hide")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorExplainButton;
