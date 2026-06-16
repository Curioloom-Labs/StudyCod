import React, { useRef, useState } from "react";
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
  failures?: ExplainErrorFailure[];
  className?: string;
};

const INTRO = tr(
  "Привіт! Я допоможу зрозуміти, ЧОМУ код не працює — навідними питаннями, без готового розв'язку. Опиши, що вже пробував, або просто запитай.",
  "Hi! I'll help you figure out WHY your code fails — with guiding questions, never a ready solution. Tell me what you've tried, or just ask."
);

/**
 * Multi-turn Socratic debug mentor. The student chats with an AI that guides
 * with questions and never hands over a full solution (enforced server-side).
 * Stateless: the whole (bounded) transcript is replayed on each turn.
 */
export const DebugMentorChat: React.FC<Props> = (props) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DebugChatMessage[]>([{ role: "mentor", content: INTRO }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const code = String(props.code ?? "");
  if (!code.trim()) return null;

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async () => {
    const text = input.trim();
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

      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={loading}
          placeholder={tr("Опиши, що думаєш або питай…", "Describe your thinking or ask…")}
          className="flex-1 resize-none bg-bg-base border border-border text-text-primary font-mono text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
        />
        <Button variant="secondary" size="sm" onClick={send} disabled={loading || !input.trim()}>
          {tr("Надіслати", "Send")}
        </Button>
      </div>
    </div>
  );
};

export default DebugMentorChat;
