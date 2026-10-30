import React from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../lib/api/client";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";

type TaskGenerationGuidanceFieldProps = {
  topicId?: number;
  taskTitle: string;
  taskType: "PRACTICE" | "CONTROL";
  responseLanguage: "uk" | "en";
  value: string;
  onChange: (value: string) => void;
  enabled: boolean;
};

type SuggestionStatus = "idle" | "waiting" | "loading" | "ready" | "edited" | "failed";

export const TaskGenerationGuidanceField: React.FC<TaskGenerationGuidanceFieldProps> = ({
  topicId,
  taskTitle,
  taskType,
  responseLanguage,
  value,
  onChange,
  enabled,
}) => {
  const [status, setStatus] = React.useState<SuggestionStatus>("idle");
  const [retryKey, setRetryKey] = React.useState(0);
  const [error, setError] = React.useState("");
  const teacherEditedRef = React.useRef(false);
  const forceGenerationRef = React.useRef(false);
  const requestRef = React.useRef<AbortController | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    const title = taskTitle.trim();
    if (!enabled || !topicId || !title) {
      setStatus("idle");
      return;
    }
    if (teacherEditedRef.current && !forceGenerationRef.current) {
      setStatus("edited");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    const generateImmediately = forceGenerationRef.current;
    forceGenerationRef.current = false;
    setError("");
    setStatus(generateImmediately ? "loading" : "waiting");

    const generate = async () => {
      setStatus("loading");
      try {
        const response = await api.post(`/topics/${topicId}/tasks/generate-guidance`, {
          taskTitle: title,
          taskType,
          responseLanguage,
        }, { signal: controller.signal });
        if (controller.signal.aborted || teacherEditedRef.current) return;
        const guidance = String(response.data?.guidance ?? "").trim();
        if (!guidance) throw new Error("EMPTY_GUIDANCE");
        onChangeRef.current(guidance);
        setStatus("ready");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(getEduErrorMessage(caught, tr("Не вдалося запропонувати налаштування. Спробуйте ще раз.", "Could not suggest settings. Try again.")));
        setStatus("failed");
      }
    };

    const timer = setTimeout(() => { void generate(); }, generateImmediately ? 0 : 850);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [enabled, topicId, taskTitle, taskType, responseLanguage, retryKey]);

  const requestAgain = () => {
    teacherEditedRef.current = false;
    forceGenerationRef.current = true;
    requestRef.current?.abort();
    setRetryKey((value) => value + 1);
  };

  const handleChange = (nextValue: string) => {
    teacherEditedRef.current = true;
    requestRef.current?.abort();
    onChange(nextValue);
    setStatus("edited");
    setError("");
  };

  if (!enabled) return null;

  const fieldId = `task-generation-guidance-${taskType.toLowerCase()}`;
  const statusText = status === "waiting"
    ? tr("ШІ підготує пропозицію за назвою…", "AI will suggest settings from the title…")
    : status === "loading"
      ? tr("ШІ підбирає налаштування…", "AI is suggesting settings…")
      : status === "ready"
        ? tr("Готово. Перегляньте й відкоригуйте пропозицію.", "Ready. Review and adjust the suggestion.")
        : status === "edited"
          ? tr("Ваші зміни збережені. За потреби можна запросити нову пропозицію.", "Your edits are kept. Request a new suggestion if needed.")
          : "";

  return (
    <section className="mb-6 rounded-2xl border border-border/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Налаштування генератора", "Generator settings")}>
      <div className="classroom-toolbar">
        <label className="task-authoring__label" htmlFor={fieldId}>{tr("Що врахувати генератору", "What the generator should consider")}</label>
        {taskTitle.trim() && <button type="button" className="classroom-text-button" onClick={requestAgain} disabled={status === "loading"}>
          <Sparkles className="size-4" aria-hidden="true" />
          {status === "failed" ? tr("Спробувати ще раз", "Try again") : tr("Запропонувати знову", "Suggest again")}
        </button>}
      </div>
      <textarea
        id={fieldId}
        name="generationGuidance"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        rows={5}
        maxLength={4000}
        placeholder={tr("Введіть назву практики — ШІ запропонує рівень учнів, ціль, контекст і правила генерації. Ви зможете все змінити.", "Enter a practice title. AI will suggest student level, goals, context, and generation rules for you to edit.")}
        className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal leading-6 dark:border-white/10 dark:bg-bg-code"
      />
      <p className="classroom-caption mt-2" aria-live="polite">
        {error || statusText || tr("Пропозиція з’явиться автоматично після введення назви. Ви зможете відкоригувати її до генерації умови, коду й теорії.", "A suggestion appears automatically after you enter a title. Edit it before generating the statement, code, and theory.")}
      </p>
    </section>
  );
};
