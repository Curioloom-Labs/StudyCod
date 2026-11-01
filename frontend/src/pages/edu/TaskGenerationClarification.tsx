import React from "react";
import { tr } from "../../i18n";

export const TaskGenerationClarification: React.FC<{
  question: string;
  busy: boolean;
  onSubmit: (answer: string) => void;
}> = ({ question, busy, onSubmit }) => {
  const [answer, setAnswer] = React.useState("");

  React.useEffect(() => setAnswer(""), [question]);

  return <section className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10" aria-live="polite">
    <p className="text-sm font-bold">{tr("Потрібне уточнення", "Clarification needed")}</p>
    <p className="mt-2 text-sm leading-6">{question}</p>
    <label className="mt-3 block text-xs font-bold text-text-muted dark:text-text-secondary">
      {tr("Ваша відповідь", "Your answer")}
      <textarea
        value={answer}
        onChange={event => setAnswer(event.target.value)}
        maxLength={1000}
        rows={2}
        disabled={busy}
        placeholder={tr("Укажіть потрібне правило своїми словами", "State the intended rule in your own words")}
        className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal text-text-primary outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code"
      />
    </label>
    <button
      type="button"
      disabled={busy || !answer.trim()}
      onClick={() => onSubmit(answer.trim())}
      className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-45 dark:bg-primary dark:text-primary-foreground"
    >
      {busy ? tr("Перевіряю умову…", "Checking the statement…") : tr("Відповісти й продовжити", "Answer and continue")}
    </button>
  </section>;
};
