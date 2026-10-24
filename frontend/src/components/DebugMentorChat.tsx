import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { tr } from "../i18n";
import { Button } from "./ui/Button";
import { debugChat, type DebugChatMessage, type ExplainErrorFailure } from "../lib/api/tasks";

type Props = {
  // Judge language hint (free-form, e.g. "PYTHON", "GO"). Forwarded to the AI mentor.
  language: string;
  code: string;
  verdict?: string | null;
  stderr?: string | null;
  taskTitle?: string;
  taskText?: string;
  taskId?: number | string;
  failures?: ExplainErrorFailure[];
  className?: string;
};

/**
 * Multi-turn Socratic debug mentor. The student gets progressive guidance and,
 * after using earlier hints, a full reasoning walkthrough without ready code.
 * Stateless: the whole (bounded) transcript is replayed on each turn.
 */
export const DebugMentorChat: React.FC<Props> = (props) => {
  useTranslation();
  const intro = tr(
    "Привіт! Я допоможу зрозуміти, ЧОМУ код не працює — поступовими підказками й розбором міркування, без готового коду. Опиши, що вже пробував, або просто запитай.",
    "Hi! I'll help you figure out WHY your code fails with progressive hints and reasoning, without copyable code. Tell me what you've tried, or just ask."
  );
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DebugChatMessage[]>([{ role: "mentor", content: intro }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages((current) => current.length === 1 ? [{ ...current[0], content: intro }] : current);
  }, [intro]);

  const code = String(props.code ?? "");
  if (!code.trim()) return null;

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async (requestedText?: string) => {
    const text = String(requestedText ?? input).trim();
    if (!text || loading) return;
    const nextMessages: DebugChatMessage[] = [...messages, { role: "student", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollToEnd();
    try {
      const res = await debugChat({
        language: props.language,
        code,
        verdict: props.verdict ?? undefined,
        stderr: props.stderr ?? undefined,
        taskTitle: props.taskTitle,
        taskText: props.taskText,
        taskId: props.taskId,
        failures: props.failures,
        messages: nextMessages,
      });
      setMessages((prev) => [...prev, { role: "mentor", content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "mentor", content: tr("Вибач, зараз не можу відповісти. Спробуй ще раз трохи згодом.", "Sorry, I can't reply right now. Please try again shortly.") },
      ]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const helpLevels = [
    {
      label: tr("1 · Запитання", "1 · Question"),
      prompt: tr("Рівень 1: постав одне навідне запитання, яке допоможе мені самому помітити наступний крок. Не розкривай ідею.", "Help level 1: ask one guiding question that helps me notice the next step myself. Do not reveal the idea."),
    },
    {
      label: tr("2 · Ідея", "2 · Idea"),
      prompt: tr("Рівень 2: поясни напрямок ідеї для цієї задачі коротко, не даючи повний план.", "Help level 2: briefly explain the direction of the idea for this task without giving the full plan."),
    },
    {
      label: tr("3 · План", "3 · Plan"),
      prompt: tr("Рівень 3: дай частковий план або псевдокод і поясни, що мені ще потрібно завершити самому.", "Help level 3: give a partial plan or pseudocode and explain what I still need to work out myself."),
    },
    {
      label: tr("4 · Повний розбір", "4 · Full walkthrough"),
      prompt: tr("Рівень 4: якщо мої попередні спроби й використані підказки відповідають умовам, поясни повністю ідею, коректність, складність і крайові випадки; готового коду не давай.", "Help level 4: if my prior attempts and hints meet the criteria, fully explain the idea, correctness, complexity, and edge cases; do not provide ready code."),
    },
  ];

  if (!open) {
    return (
      <div className={props.className}>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {tr("🤖 Запитати ментора", "🤖 Ask the mentor")}
        </Button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-bg-base/60 ${props.className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-[10px] font-mono text-primary">{tr("🤖 Дебаг-ментор", "🤖 Debug mentor")}</div>
        <button
          type="button"
          className="text-[10px] font-mono text-text-secondary hover:text-text-primary"
          onClick={() => setOpen(false)}
        >
          {tr("Згорнути", "Collapse")}
        </button>
      </div>

      <div ref={scrollRef} className="max-h-64 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs font-mono whitespace-pre-wrap leading-relaxed rounded-md px-2 py-1.5 ${
              m.role === "mentor"
                ? "bg-bg-hover/50 text-text-primary self-start max-w-[92%]"
                : "bg-primary/10 text-text-primary self-end max-w-[92%]"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="text-xs font-mono text-text-secondary self-start">{tr("Ментор друкує…", "Mentor is typing…")}</div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <div role="group" className="mb-2 flex flex-wrap gap-1.5" aria-label={tr("Рівні допомоги", "Help levels")}>
          {helpLevels.map((level) => (
            <Button key={level.label} variant="ghost" size="sm" disabled={loading} onClick={() => void send(level.prompt)}>
              {level.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={loading}
            placeholder={tr("Опиши, що думаєш або питай…", "Describe your thinking or ask…")}
            className="flex-1 resize-none bg-bg-base border border-border text-text-primary font-mono text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />
          <Button variant="secondary" size="sm" onClick={() => void send()} disabled={loading || !input.trim()}>
            {tr("Надіслати", "Send")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DebugMentorChat;
