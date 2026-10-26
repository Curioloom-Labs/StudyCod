import React from "react";
import { useTranslation } from "react-i18next";
import {
  assignGrowthReview,
  getGrowthActiveReviewers,
  getGrowthAdminReviewRequests,
  grantGrowthReviewer,
  revokeGrowthReviewer,
} from "../../lib/api/growthProjects";

function errorText(error: any) {
  return String(error?.response?.data?.message ?? error?.response?.data?.code ?? "REQUEST_FAILED");
}

export const GrowthAdminReviewQueuePage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [requests, setRequests] = React.useState<Array<Record<string, any>>>([]);
  const [reviewers, setReviewers] = React.useState<Array<Record<string, any>>>([]);
  const [assignments, setAssignments] = React.useState<Record<string, string>>({});
  const [username, setUsername] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const reload = React.useCallback(async () => {
    const [nextRequests, nextReviewers] = await Promise.all([getGrowthAdminReviewRequests(), getGrowthActiveReviewers()]);
    setRequests(nextRequests); setReviewers(nextReviewers);
  }, []);
  React.useEffect(() => { void reload().catch(err => setError(errorText(err))); }, [reload]);
  const addReviewer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try { await grantGrowthReviewer(username.trim()); setUsername(""); await reload(); setNotice(en ? "Reviewer access granted." : "Доступ рецензента надано."); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const assign = async (requestId: string) => {
    const reviewerId = Number(assignments[requestId]);
    if (!reviewerId) return;
    setBusy(true); setError(""); setNotice("");
    try { await assignGrowthReview(requestId, reviewerId); await reload(); setNotice(en ? "Review assigned." : "Рецензію призначено."); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const revoke = async (userId: number) => {
    setBusy(true); setError(""); setNotice("");
    try { await revokeGrowthReviewer(userId); await reload(); setNotice(en ? "Reviewer access revoked." : "Доступ рецензента відкликано."); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  return <main id="main-content" className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-primary-soft">StudyCod · Admin</div><h1 className="mt-2 text-3xl font-bold">{en ? "Project reviews" : "Рецензії проєктів"}</h1><p className="mt-2 text-sm text-text-secondary">{en ? "Assign requests to users with a dedicated reviewer grant." : "Призначай запити користувачам з окремим правом рецензента."}</p></div><button type="button" onClick={() => window.location.assign("/projects")} className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold">{en ? "Projects" : "До проєктів"}</button></div>
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
    {notice && <div role="status" className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div>}
    <section className="mt-5 rounded-2xl border border-border bg-bg-surface p-5"><h2 className="text-lg font-bold">{en ? "Reviewer permissions" : "Дозволи рецензентів"}</h2><form onSubmit={event => void addReviewer(event)} className="mt-3 flex flex-wrap gap-2"><input value={username} onChange={event => setUsername(event.target.value)} placeholder={en ? "Personal username" : "Username особистого акаунта"} className="min-h-10 min-w-56 flex-1 rounded-lg border border-border bg-bg-base px-3 text-sm" /><button disabled={busy || !username.trim()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{en ? "Grant" : "Надати доступ"}</button></form><div className="mt-4 space-y-2">{reviewers.map(reviewer => <div key={reviewer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-base p-3"><span className="text-sm font-semibold">{reviewer.username}</span><button type="button" disabled={busy} onClick={() => void revoke(Number(reviewer.id))} className="min-h-8 rounded-lg border border-border px-3 text-xs font-semibold">{en ? "Revoke" : "Відкликати"}</button></div>)}{!reviewers.length && <p className="text-sm text-text-muted">{en ? "No active reviewer grants." : "Немає активних дозволів."}</p>}</div></section>
    <section className="mt-5 rounded-2xl border border-border bg-bg-surface p-5"><h2 className="text-lg font-bold">{en ? "Unassigned requests" : "Непризначені запити"}</h2><div className="mt-3 space-y-3">{requests.map(request => <article key={request.id} className="rounded-xl bg-bg-base p-4"><div className="text-sm font-semibold">{request.owner_username} · {request.family_key} · {request.runtime}</div><div className="mt-1 text-xs text-text-muted">{new Date(request.created_at).toLocaleString(en ? "en-US" : "uk-UA")}</div><div className="mt-3 flex flex-wrap gap-2"><select value={assignments[request.id] ?? ""} onChange={event => setAssignments(old => ({ ...old, [request.id]: event.target.value }))} className="min-h-9 min-w-52 rounded-lg border border-border bg-bg-surface px-2 text-sm"><option value="">{en ? "Choose a reviewer" : "Обери рецензента"}</option>{reviewers.map(reviewer => <option key={reviewer.id} value={reviewer.id}>{reviewer.username}</option>)}</select><button type="button" disabled={busy || !assignments[request.id]} onClick={() => void assign(request.id)} className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">{en ? "Assign" : "Призначити"}</button></div></article>)}{!requests.length && <p className="text-sm text-text-muted">{en ? "No requests are waiting." : "Немає запитів для призначення."}</p>}</div></section>
  </main>;
};
