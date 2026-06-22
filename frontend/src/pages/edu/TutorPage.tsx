import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Sparkles, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { askAiTutor, type TutorAnswerDto } from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const SUGGESTIONS_UK = ["Поясни мою останню помилку простими словами", "Дай схожу легшу задачу для тренування", "Як підійти до рекурсії?"];
const SUGGESTIONS_EN = ["Explain my last mistake in simple terms", "Give me an easier similar task to practice", "How do I approach recursion?"];

export const TutorPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tr = (uk: string, en: string) => (isEn ? en : uk);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TutorAnswerDto | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setLoading(true);
    setAnswer(null);
    try {
      const { tutor } = await askAiTutor(text);
      setAnswer(tutor);
    } catch (error) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("AI-тьютор зараз недоступний", "AI tutor is unavailable right now")) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// tutor"
        eyebrowAurora={tr("Тьютор", "Tutor")}
        title={tr("AI-тьютор", "AI tutor")}
        subtitle={tr("Персональний помічник, що знає твої останні роботи. Питай — наведе на думку.", "A personal helper that knows your recent work. Ask — it nudges you toward the answer.")}
        maxWidth="3xl"
      />

      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto space-y-5">
        <div className="rounded-xl border border-border bg-bg-surface p-3">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask(); }}
            rows={3}
            placeholder={tr("Напиши своє питання…", "Type your question…")}
            className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm rounded-lg focus:outline-none focus:border-primary resize-y"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Ctrl+Enter</span>
            <Button onClick={() => ask()} disabled={loading || !question.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {loading ? tr("Думаю…", "Thinking…") : tr("Запитати", "Ask")}
            </Button>
          </div>
        </div>

        {!answer && !loading && (
          <div className="flex flex-wrap gap-2">
            {(isEn ? SUGGESTIONS_EN : SUGGESTIONS_UK).map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ask(s)}
                className="text-xs font-mono px-3 py-1.5 rounded-full border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {answer && (
          <div className="rounded-xl border border-border bg-bg-surface p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
            </div>
            {answer.tips.length > 0 && (
              <div className="pl-11 space-y-1.5">
                {answer.tips.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
