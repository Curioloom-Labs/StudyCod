import React from "react";
import { askAssessFollowup, respondAssessFollowup } from "../../lib/api/assessCompanies";

type Followup = {
  id: string;
  reviewerType: "HR" | "TECHNICAL";
  question: string;
  response: string | null;
  askedAt: string;
  answeredAt: string | null;
  reviewerUsername: string | null;
};

export function AssessFollowupsPanel({
  assessmentId,
  companyId,
  items,
  mode,
  reviewerType,
  suggestedQuestions = [],
  en,
  onRefresh,
}: {
  assessmentId: string;
  companyId?: string;
  items?: Followup[];
  mode: "candidate" | "reviewer";
  reviewerType?: "HR" | "TECHNICAL";
  suggestedQuestions?: string[];
  en: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [question, setQuestion] = React.useState("");
  const [responses, setResponses] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const followups = items ?? [];
  const openCount = followups.filter(item => !item.answeredAt).length;

  const ask = async () => {
    if (!companyId || !reviewerType || question.trim().length < 8 || followups.length >= 6 || openCount >= 3) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await askAssessFollowup(companyId, assessmentId, reviewerType, question.trim());
      setQuestion("");
      await onRefresh();
      setNotice(en ? "Question sent to the candidate." : "Запитання надіслано кандидату.");
    } catch (caught) {
      setError(String((caught as any)?.response?.data?.code ?? (en ? "Could not send the question." : "Не вдалося надіслати запитання.")));
    } finally { setBusy(false); }
  };

  const answer = async (id: string) => {
    const response = (responses[id] ?? "").trim();
    if (!response) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await respondAssessFollowup(assessmentId, id, response);
      await onRefresh();
      setNotice(en ? "Your answer was sent." : "Відповідь надіслано.");
    } catch (caught) {
      setError(String((caught as any)?.response?.data?.code ?? (en ? "Could not send your answer." : "Не вдалося надіслати відповідь.")));
    } finally { setBusy(false); }
  };

  return <section className="assess-panel">
    <h3 className="font-bold">{en ? "Follow-up questions" : "Уточнювальні запитання"}</h3>
    <p className="mt-1 text-sm leading-6 text-text-secondary">{mode === "candidate"
      ? (en ? "The hiring team may ask a short question about your submitted work. Your answer becomes part of this assessment." : "Команда найму може уточнити деталь у поданій роботі. Відповідь стане частиною цього оцінювання.")
      : (en ? "Ask about a specific claim or decision. Candidates can answer once per question. Up to three questions may be open at a time." : "Запитай про конкретне твердження або рішення. На кожне запитання кандидат відповідає один раз. Одночасно відкриті до трьох запитань.")}</p>
    {!!followups.length && <div className="mt-4 space-y-3">{followups.map(item => <article key={item.id} className="rounded-xl border border-border bg-bg-base p-4">
      <p className="text-xs font-semibold text-text-muted">{item.reviewerType === "HR" ? "HR" : (en ? "Technical reviewer" : "Технічний рецензент")} · {new Date(item.askedAt).toLocaleString(en ? "en-GB" : "uk-UA")}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold">{item.question}</p>
      {item.response ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{item.response}</p>
        : mode === "candidate" ? <><textarea rows={3} maxLength={6000} value={responses[item.id] ?? ""} onChange={event => setResponses(current => ({ ...current, [item.id]: event.target.value }))} className="assess-field mt-3"/><button type="button" disabled={busy || !responses[item.id]?.trim()} onClick={() => void answer(item.id)} className="assess-button assess-button--primary mt-2">{en ? "Send answer" : "Надіслати відповідь"}</button></>
          : <p className="mt-2 text-xs text-text-muted">{en ? "Waiting for the candidate" : "Очікуємо на відповідь кандидата"}</p>}
    </article>)}</div>}
    {mode === "reviewer" && <div className="mt-4 border-t border-border pt-4">
      {!!suggestedQuestions.length && <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-bold uppercase tracking-wide text-primary">{en ? "Evidence gaps to explore" : "Що варто уточнити"}</p><p className="mt-1 text-xs leading-5 text-text-secondary">{en ? "Suggestions come from criteria marked as unassessed or limited by a reviewer. A person chooses whether to use them; they do not score or rank candidates." : "Підказки враховують критерії, які рецензент позначив як неоцінені або з обмеженими доказами. Рецензент сам вирішує, чи ставити запитання; підказки не оцінюють і не ранжують кандидатів."}</p><div className="mt-2 flex flex-wrap gap-2">{suggestedQuestions.map((suggestion, index) => <button key={`${index}-${suggestion}`} type="button" className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-left text-xs leading-5 text-text-secondary hover:border-primary" disabled={busy || followups.length >= 6 || openCount >= 3} onClick={() => setQuestion(suggestion)}>{en ? `Use probe ${index + 1}` : `Використати уточнення ${index + 1}`}</button>)}</div></div>}
      <label className="block text-sm font-semibold">{en ? "Ask one follow-up" : "Поставити уточнювальне запитання"}<textarea rows={3} maxLength={1200} value={question} onChange={event => setQuestion(event.target.value)} className="assess-field mt-2" placeholder={en ? "Which tradeoff led you to this design?" : "Яке компромісне рішення вплинуло на цей дизайн?"}/></label><button type="button" disabled={busy || question.trim().length < 8 || followups.length >= 6 || openCount >= 3} onClick={() => void ask()} className="assess-button assess-button--primary mt-3">{busy ? (en ? "Sending…" : "Надсилаємо…") : (en ? "Send question" : "Надіслати запитання")}</button><p className="mt-2 text-xs text-text-muted">{en ? `${followups.length}/6 questions used` : `Використано запитань: ${followups.length}/6`}</p></div>}
    {error && <p role="alert" className="mt-3 text-sm text-accent-error">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-text-secondary">{notice}</p>}
  </section>;
}
