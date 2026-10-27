import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, BookOpen, Lightbulb, Send } from "lucide-react";
import { askAiTutor, type TutorAnswerDto } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";

const suggestions = [
  ["Поясни мою останню помилку простими словами", "Explain my last error in simple terms"],
  ["Дай схожу, але легшу задачу для практики", "Give me a similar but easier task to practice"],
  ["Як підійти до рекурсії?", "How should I approach recursion?"],
  ["Допоможи розбити задачу на кроки", "Help me break the task into steps"],
] as const;
const root = "mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12";

export const StudyCompanionPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const copy = (uk: string, english: string) => en ? english : uk;
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<TutorAnswerDto | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ask = async (value?: string) => {
    const text = (value ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    try {
      const result = await askAiTutor(text);
      setAnswer(result.tutor);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Помічник зараз недоступний. Спробуйте ще раз трохи пізніше.", "The study companion is unavailable right now. Please try again shortly.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={root}>
      <header className="grid gap-7 rounded-[34px] bg-bg-hover p-6 dark:bg-bg-base lg:grid-cols-[1.2fr_.8fr] lg:p-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{copy("Навчальний супровід", "Study companion")}</p>
          <h1 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.065em] sm:text-6xl">{copy("Розберімося, а не просто знайдемо відповідь.", "Understand the problem, not just find an answer.")}</h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-text-muted dark:text-text-secondary">{copy("Сформулюйте, де саме зупинилися. Помічник допоможе побачити наступний крок, але рішення лишається вашим.", "Describe where you got stuck. The companion will help you find the next step while the solution stays yours.")}</p>
        </div>
        <aside className="self-end rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[.06]">
          <BookOpen className="h-5 w-5 text-accent-warn" />
          <p className="mt-3 text-sm font-bold">{copy("Спробуйте конкретно", "Be specific")}</p>
          <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{copy("Назвіть мову, задачу, очікуваний результат і те, що вже пробували.", "Mention the language, task, expected result, and what you have tried so far.")}</p>
        </aside>
      </header>

      <main className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
        <aside className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{copy("Почати розмову", "Start a conversation")}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">{copy("Що саме не сходиться?", "What isn't adding up?")}</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {suggestions.map(([uk, english]) => {
              const item = copy(uk, english);
              return <button type="button" key={uk} onClick={() => void ask(item)} className="rounded-full border border-border/10 bg-white px-3 py-2 text-left text-xs font-semibold text-text-secondary transition hover:border-primary/35 hover:text-primary-strong dark:border-white/10 dark:bg-white/[.04] dark:text-text-secondary dark:hover:text-primary-soft">{item}<ArrowUpRight className="ml-1 inline h-3 w-3" /></button>;
            })}
          </div>
          <div className="mt-7 rounded-[26px] bg-bg-hover p-5 dark:bg-accent-warn/10">
            <Lightbulb className="h-5 w-5 text-accent-warn dark:text-accent-warn" />
            <p className="mt-3 text-sm font-bold text-accent-warn dark:text-accent-warn">{copy("Точний опис допоможе швидше знайти причину.", "A clear description helps find the cause faster.")}</p>
            <p className="mt-2 text-sm leading-6 text-accent-warn dark:text-accent-warn">{copy("Замість «не працює» опишіть фактичний і очікуваний результат.", "Instead of saying “it doesn't work,” describe what happened and what you expected.")}</p>
          </div>
        </aside>

        <section className="min-w-0 rounded-[30px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface sm:p-7">
          <div className="min-h-[270px]">
            {busy ? (
              <div className="space-y-3" role="status" aria-label={copy("Помічник готує відповідь", "The companion is preparing an answer")}>
                <div className="h-5 w-32 animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
                <div className="h-4 w-full animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
                <div className="h-4 w-[82%] animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
              </div>
            ) : answer ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{copy("Наступний крок", "Next step")}</p>
                <p className="mt-4 whitespace-pre-wrap [overflow-wrap:anywhere] text-base leading-8 text-text-primary dark:text-text-primary">{answer.answer}</p>
                {answer.tips?.length > 0 && <div className="mt-7 border-t border-border/10 pt-5 dark:border-white/[.08]">
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-accent-warn">{copy("Спробуйте далі", "Try this next")}</p>
                  <ul className="mt-3 space-y-3">{answer.tips.map((tip) => <li key={tip} className="flex min-w-0 gap-3 text-sm leading-6 text-text-muted dark:text-text-secondary"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span className="min-w-0 [overflow-wrap:anywhere]">{tip}</span></li>)}</ul>
                </div>}
              </div>
            ) : (
              <div className="grid min-h-[270px] place-items-center text-center">
                <div>
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><Lightbulb className="h-6 w-6" /></span>
                  <h3 className="mt-4 text-xl font-bold">{copy("Тут з’явиться розбір.", "Your explanation will appear here.")}</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-muted dark:text-text-secondary">{copy("Оберіть підказку або сформулюйте власне питання нижче.", "Choose a prompt or write your own question below.")}</p>
                </div>
              </div>
            )}
          </div>
          {error && <p role="alert" aria-live="polite" className="mt-4 rounded-xl bg-bg-hover px-3 py-2 text-sm text-accent-error dark:bg-accent-error/10 dark:text-accent-error">{error}</p>}
          <div className="mt-5 rounded-2xl border border-border/10 p-3 dark:border-white/[.09]">
            <label htmlFor="study-companion-question" className="sr-only">{copy("Питання", "Question")}</label>
            <textarea id="study-companion-question" name="question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void ask(); }} rows={3} placeholder={copy("Напишіть питання про код, логіку або підхід…", "Ask about code, logic, or an approach…")} className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-text-secondary dark:placeholder:text-text-muted" />
            <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-text-muted dark:text-text-muted">Ctrl + Enter</span><button type="button" disabled={busy || !question.trim()} onClick={() => void ask()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Send className="mr-1 inline h-4 w-4" />{copy("Надіслати", "Send")}</button></div>
          </div>
        </section>
      </main>
    </div>
  );
};
