import React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { getGrowthReview, getGrowthReviewInbox, respondGrowthReview, submitGrowthReview } from "../../lib/api/portfolioProjects";
import type { GrowthFile } from "../../lib/api/portfolioProjects";

function reviewMessage(error: any, fallback: string) {
  return String(error?.response?.data?.message ?? error?.response?.data?.code ?? fallback);
}

export const PortfolioReviewInboxPage: React.FC = () => {
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [reviews, setReviews] = React.useState<Array<Record<string, any>>>([]);
  const [selected, setSelected] = React.useState<Record<string, any> | null>(null);
  const [scores, setScores] = React.useState([0, 0, 0, 0]);
  const [comment, setComment] = React.useState("");
  const [recommendation, setRecommendation] = React.useState<"READY_TO_PUBLISH" | "NEEDS_WORK">("NEEDS_WORK");
  const [namePublic, setNamePublic] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const openedQueryReview = React.useRef("");
  const reload = React.useCallback(async () => setReviews(await getGrowthReviewInbox()), []);
  React.useEffect(() => { void reload().catch(err => setError(reviewMessage(err, "Не вдалося завантажити рецензії"))); }, [reload]);

  const open = async (id: string) => {
    setBusy(true); setError("");
    try {
      const review = await getGrowthReview(id);
      setSelected(review); setScores(Array.isArray(review.scores) ? review.scores : [0, 0, 0, 0]);
      setComment(review.comment ?? ""); setRecommendation(review.recommendation ?? "NEEDS_WORK");
      setNamePublic(Boolean(review.reviewerNamePublic));
    } catch (err) { setError(reviewMessage(err, "Рецензія недоступна")); }
    finally { setBusy(false); }
  };
  const requestedReviewId = params.get("review") ?? "";
  React.useEffect(() => {
    if (!requestedReviewId || openedQueryReview.current === requestedReviewId) return;
    openedQueryReview.current = requestedReviewId;
    void open(requestedReviewId);
  }, [requestedReviewId]);
  const decide = async (decision: "ACCEPT" | "DECLINE") => {
    if (!selected) return;
    setBusy(true);
    try { await respondGrowthReview(selected.id, decision); if (decision === "ACCEPT") await open(selected.id); else { setSelected(null); await reload(); } }
    catch (err) { setError(reviewMessage(err, "Не вдалося відповісти на запрошення")); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { await submitGrowthReview(selected.id, { scores, comment, recommendation, reviewerNamePublic: namePublic }); await open(selected.id); await reload(); }
    catch (err) { setError(reviewMessage(err, "Не вдалося зберегти відгук")); }
    finally { setBusy(false); }
  };
  const criteria = en ? ["Understanding requirements", "Reasoning", "Code structure and clarity", "Edge cases and regression checks"] : ["Розуміння вимог", "Обґрунтування рішення", "Структура та зрозумілість коду", "Крайові випадки й регресії"];

  return <main id="main-content" className="mx-auto max-w-5xl px-4 py-7 sm:px-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-primary-soft">StudyCod · Portfolio</div><h1 className="mt-2 text-3xl font-bold">{en ? "Review inbox" : "Черга рецензій"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{en ? "Each package is frozen to the author's chosen version." : "Кожен пакет матеріалів зафіксований для обраної автором версії."}</p></div><button type="button" onClick={() => window.location.assign("/portfolio/projects")} className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold">{en ? "Portfolio workbench" : "До майстерні портфоліо"}</button></div>
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
    <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]"><section className="rounded-2xl border border-border bg-bg-surface p-4"><h2 className="font-bold">{en ? "Assigned to me" : "Мені призначено"}</h2>{reviews.length ? reviews.map(review => <button key={review.id} onClick={() => void open(review.id)} className="mt-2 block w-full rounded-xl bg-bg-base p-3 text-left text-sm"><strong>{review.kind === "OFFICIAL" ? (en ? "Appointed review" : "Призначена рецензія") : (en ? "Invited review" : "Запрошений відгук")}</strong><span className="mt-1 block text-xs text-text-muted">{review.status}</span></button>) : <p className="mt-3 text-sm text-text-muted">{en ? "Nothing is waiting for review." : "Немає робіт, що очікують на відгук."}</p>}</section>
      <section className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-6">{!selected ? <p className="text-sm text-text-secondary">{en ? "Open a request to inspect its frozen materials." : "Відкрий запит, щоб переглянути зафіксовані матеріали."}</p> : <>
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{selected.kind === "OFFICIAL" ? (en ? "Appointed reviewer" : "Призначений рецензент") : (en ? "Invited reviewer" : "Запрошений рецензент")}</h2><p className="mt-1 text-sm text-text-secondary">{selected.status}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-border px-3 py-2 text-xs">{en ? "Close" : "Закрити"}</button></div>
        {selected.status === "INVITED" ? <div className="mt-5 flex gap-2"><button disabled={busy} onClick={() => void decide("ACCEPT")} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">{en ? "Accept" : "Прийняти"}</button><button disabled={busy} onClick={() => void decide("DECLINE")} className="min-h-10 rounded-xl border border-border px-4 text-sm">{en ? "Decline" : "Відмовитись"}</button></div> : <><div className="mt-5 rounded-xl bg-bg-base p-4"><div className="text-xs font-bold uppercase tracking-wide text-primary-soft">{selected.snapshot?.version?.stage} · #{selected.snapshot?.version?.sequence}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{selected.snapshot?.version?.explanation}</p><div className="mt-3 flex flex-wrap gap-2">{selected.snapshot?.version?.files?.map((file: GrowthFile) => <details key={file.path} className="w-full rounded-lg bg-bg-surface p-3"><summary className="cursor-pointer text-xs font-semibold">{file.path}</summary><pre className="mt-2 max-h-72 overflow-auto text-xs leading-5">{file.content}</pre></details>)}</div>{selected.snapshot?.assessments?.map((attempt: any) => <div key={attempt.id} className="mt-3 rounded-lg border border-border p-3 text-xs"><strong>{attempt.kind} · {attempt.status}</strong><p className="mt-1 whitespace-pre-wrap text-text-secondary">{attempt.explanation}</p></div>)}</div>
          {selected.status === "PENDING" && <><div className="mt-5 space-y-3">{criteria.map((criterion, index) => <label key={criterion} className="flex items-center justify-between gap-4 rounded-xl bg-bg-base p-3 text-sm"><span>{criterion}</span><select value={scores[index]} onChange={event => setScores(old => old.map((value, current) => current === index ? Number(event.target.value) : value))} className="rounded-lg border border-border bg-bg-surface px-2 py-2"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>)}</div><label className="mt-4 block text-sm font-semibold">{en ? "Comments" : "Коментар"}<textarea value={comment} onChange={event => setComment(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-bg-base p-3 text-sm font-normal" /></label><label className="mt-4 block text-sm">{en ? "Recommendation" : "Рекомендація"}<select value={recommendation} onChange={event => setRecommendation(event.target.value as any)} className="mt-2 block w-full rounded-xl border border-border bg-bg-base p-3"><option value="READY_TO_PUBLISH">{en ? "Ready to publish" : "Готово до публікації"}</option><option value="NEEDS_WORK">{en ? "Needs more work" : "Варто доопрацювати"}</option></select></label><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={namePublic} onChange={event => setNamePublic(event.target.checked)} />{en ? "I agree that my reviewer name may be shown publicly if the author chooses to display this review." : "Погоджуюсь показати моє ім’я рецензента, якщо автор вирішить опублікувати цей відгук."}</label><button type="button" disabled={busy || !comment.trim()} onClick={() => void submit()} className="mt-4 min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{en ? "Submit review" : "Надіслати відгук"}</button></>}
          {selected.status === "SUBMITTED" && <div className="mt-5 rounded-xl bg-bg-base p-4"><strong>{en ? "Review submitted" : "Рецензію надіслано"}</strong><p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{selected.comment}</p><p className="mt-2 text-sm">{en ? "Score" : "Оцінка"}: {selected.scores?.join(" / ")}</p></div>}
        </>}
      </>}</section></div>
  </main>;
};
