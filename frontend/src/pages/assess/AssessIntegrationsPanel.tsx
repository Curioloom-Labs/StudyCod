import React from "react";
import { Check, Copy, KeyRound, LoaderCircle, Plus, Webhook } from "lucide-react";
import {
  createAssessApiKey,
  createAssessWebhook,
  getAssessCompanyIntegrations,
  revokeAssessApiKey,
  setAssessWebhookEnabled,
} from "../../lib/api/assessCompanies";

const field = "mt-1 w-full rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const eventsHelp: Record<string, [string, string]> = {
  "assessment.invited": ["Запрошення створено", "Invitation created"],
  "assessment.claimed": ["Кандидат підтвердив email", "Candidate claimed invitation"],
  "assessment.accepted": ["Кандидат надав згоду", "Candidate consented"],
  "assessment.declined": ["Кандидат відхилив запрошення", "Candidate declined"],
  "assessment.evidence_selected": ["Кандидат передав роботу", "Candidate shared evidence"],
  "assessment.answers_submitted": ["Відповіді подано", "Answers submitted"],
  "assessment.task_assigned": ["Завдання призначено", "Task assigned"],
  "assessment.task_submitted": ["Роботу подано на перевірку", "Task submitted"],
  "assessment.review_saved": ["Відгук збережено", "Review saved"],
  "assessment.decision_saved": ["Рішення зафіксовано", "Hiring decision saved"],
  "assessment.withdrawn": ["Кандидат відкликав згоду", "Candidate withdrew"],
};

export function AssessIntegrationsPanel({ companyId, en }: { companyId: string; en: boolean }) {
  const [data, setData] = React.useState<Record<string, any> | null>(null);
  const [apiName, setApiName] = React.useState("ATS integration");
  const [readScope, setReadScope] = React.useState(true);
  const [writeScope, setWriteScope] = React.useState(true);
  const [webhookName, setWebhookName] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>(["assessment.invited", "assessment.accepted", "assessment.task_submitted", "assessment.review_saved", "assessment.decision_saved"]);
  const [secret, setSecret] = React.useState("");
  const [secretLabel, setSecretLabel] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const refresh = React.useCallback(async () => {
    setData(await getAssessCompanyIntegrations(companyId));
  }, [companyId]);
  React.useEffect(() => {
    void refresh().catch(caught => setError(String((caught as any)?.response?.data?.message ?? (en ? "Could not load integrations." : "Не вдалося завантажити інтеграції.")))).finally(() => setLoading(false));
  }, [refresh, en]);

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (caught) { setError(String((caught as any)?.response?.data?.message ?? (caught as any)?.message ?? (en ? "The integration action failed." : "Не вдалося виконати дію з інтеграцією."))); }
    finally { setBusy(false); }
  };
  const issueApiKey = () => withBusy(async () => {
    const scopes = [readScope && "assessments:read", writeScope && "assessments:write"].filter(Boolean) as Array<"assessments:read" | "assessments:write">;
    if (!scopes.length) throw new Error(en ? "Select at least one permission." : "Обери щонайменше один дозвіл.");
    const created = await createAssessApiKey(companyId, { name: apiName, scopes });
    setSecret(created.token); setSecretLabel(en ? "New API key" : "Новий API ключ"); setCopied(false);
    setNotice(en ? "Key created. Copy it now; it will not be shown again." : "Ключ створено. Скопіюй його зараз — повторно його не буде показано.");
    await refresh();
  });
  const createWebhook = () => withBusy(async () => {
    const created = await createAssessWebhook(companyId, { name: webhookName, url: webhookUrl, events: selectedEvents });
    setSecret(created.secret); setSecretLabel(en ? "Webhook signing secret" : "Секрет підпису webhook"); setCopied(false);
    setWebhookName(""); setWebhookUrl("");
    setNotice(en ? "Webhook added. Store this signing secret now; it will not be shown again." : "Webhook додано. Збережи секрет підпису зараз — повторно його не буде показано.");
    await refresh();
  });
  const copySecret = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret); setCopied(true); }
    catch { setError(en ? "Clipboard access failed. Select and copy the secret manually." : "Не вдалося скопіювати. Виділи секрет і скопіюй вручну."); }
  };
  const toggleEvent = (eventName: string) => setSelectedEvents(current => current.includes(eventName) ? current.filter(item => item !== eventName) : [...current, eventName]);

  if (!data) return <div className="rounded-2xl border border-border bg-bg-surface p-6 text-sm text-text-secondary" role={loading ? "status" : undefined}>{error || (en ? "Loading integrations…" : "Завантажуємо інтеграції…")}{!loading && <button type="button" onClick={() => { setLoading(true); void refresh().catch(caught => setError(String((caught as any)?.response?.data?.message ?? (en ? "Could not load integrations." : "Не вдалося завантажити інтеграції.")))).finally(() => setLoading(false)); }} className="ml-3 font-semibold text-primary">{en ? "Retry" : "Повторити"}</button>}</div>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3"><KeyRound className="mt-1 size-5 text-primary"/><div><h2 className="text-lg font-bold">{en ? "ATS API access" : "Доступ до ATS API"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{en ? "Create a company-scoped key for your applicant tracking system. Keys are shown once, stored as hashes, and can be revoked at any time." : "Створи ключ для ATS, обмежений цим простором компанії. Ключ показується один раз, зберігається як хеш і може бути відкликаний."}</p></div></div>
      <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={event => { event.preventDefault(); void issueApiKey(); }}>
        <label className="text-sm font-semibold">{en ? "Key name" : "Назва ключа"}<input className={field} minLength={2} maxLength={120} required value={apiName} onChange={event => setApiName(event.target.value)}/></label>
        <div className="flex flex-wrap items-end gap-4 pb-1 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={readScope} onChange={event => setReadScope(event.target.checked)}/>{en ? "Read assessments" : "Читати оцінювання"}</label><label className="flex items-center gap-2"><input type="checkbox" checked={writeScope} onChange={event => setWriteScope(event.target.checked)}/>{en ? "Create invitations" : "Створювати запрошення"}</label><button type="submit" disabled={busy || (!readScope && !writeScope)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Plus className="size-4"/>}{en ? "Create API key" : "Створити API ключ"}</button></div>
      </form>
      <div className="mt-4 rounded-xl bg-bg-base p-3 text-xs leading-5 text-text-secondary"><strong>{en ? "Versioned API" : "Версійований API"}</strong><p className="mt-1">POST {data.api?.basePath ?? "/api/v1/assess"}/assessments · GET {data.api?.basePath ?? "/api/v1/assess"}/assessments</p><p>Authorization: Bearer &lt;API_KEY&gt; · {en ? "POST requires an Idempotency-Key header." : "Для POST обов’язковий заголовок Idempotency-Key."}</p></div>
      {!!data.apiKeys?.length && <div className="mt-4 divide-y divide-border rounded-xl border border-border px-4">{data.apiKeys.map((key: any) => <article key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{key.name} <code className="ml-1 rounded bg-bg-base px-1.5 py-1 text-xs">{key.keyPrefix}…</code></p><p className="mt-1 text-xs text-text-muted">{(key.scopes ?? []).join(" · ")} · {key.revoked ? (en ? "Revoked" : "Відкликано") : key.lastUsedAt ? (en ? "Last used " : "Востаннє використано ") + new Date(key.lastUsedAt).toLocaleString(en ? "en-GB" : "uk-UA") : (en ? "Not used yet" : "Ще не використовувався")}</p></div>{!key.revoked && <button type="button" disabled={busy} onClick={() => void withBusy(async () => { await revokeAssessApiKey(companyId, key.id); await refresh(); setNotice(en ? "API key revoked." : "API ключ відкликано."); })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">{en ? "Revoke" : "Відкликати"}</button>}</article>)}</div>}
      {!data.apiKeys?.length && <p className="mt-4 text-sm text-text-muted">{en ? "No API keys yet." : "API ключів ще немає."}</p>}
    </section>

    <section className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3"><Webhook className="mt-1 size-5 text-primary"/><div><h2 className="text-lg font-bold">Webhooks</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{en ? "Receive signed, retryable events when an assessment changes. Events include IDs and status; the final-decision event also includes its outcome and candidate-release flag. Candidate answers are never sent." : "Отримуй підписані події зі спробами повторної доставки. Події містять ідентифікатори й статус; подія фінального рішення також містить результат і прапорець показу кандидату. Відповіді кандидата не передаються."}</p></div></div>
      <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={event => { event.preventDefault(); void createWebhook(); }}>
        <label className="text-sm font-semibold">{en ? "Endpoint name" : "Назва endpoint"}<input className={field} required minLength={2} maxLength={120} value={webhookName} onChange={event => setWebhookName(event.target.value)}/></label>
        <label className="text-sm font-semibold">{en ? "HTTPS endpoint URL" : "HTTPS URL endpoint"}<input className={field} required type="url" placeholder="https://ats.example.com/webhooks/studycod" value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)}/></label>
        <fieldset className="lg:col-span-2"><legend className="text-sm font-semibold">{en ? "Events" : "Події"}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(data.webhookEvents ?? []).map((eventName: string) => <label key={eventName} className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs"><input type="checkbox" checked={selectedEvents.includes(eventName)} onChange={() => toggleEvent(eventName)} className="mt-0.5"/><span><strong>{eventName}</strong><small className="mt-0.5 block text-text-muted">{eventsHelp[eventName]?.[en ? 1 : 0] ?? eventName}</small></span></label>)}</div></fieldset>
        <div className="lg:col-span-2"><button type="submit" disabled={busy || !webhookName.trim() || !webhookUrl.trim() || !selectedEvents.length} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Plus className="size-4"/>}{en ? "Add webhook" : "Додати webhook"}</button></div>
      </form>
      {!!data.webhooks?.length && <div className="mt-4 divide-y divide-border rounded-xl border border-border px-4">{data.webhooks.map((webhook: any) => <article key={webhook.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{webhook.name} <span className={"ml-1 rounded-md px-2 py-0.5 text-[11px] " + (webhook.enabled ? "bg-accent-success/10 text-accent-success" : "bg-bg-hover text-text-muted")}>{webhook.enabled ? (en ? "Enabled" : "Увімкнено") : (en ? "Paused" : "Призупинено")}</span></p><p className="mt-1 break-all text-xs text-text-muted">{webhook.url}</p><p className="mt-1 text-xs text-text-muted">{(webhook.events ?? []).join(" · ")} · {en ? "last delivery" : "остання доставка"}: {webhook.lastDeliveryStatus ?? (en ? "none" : "немає")}</p></div><button type="button" disabled={busy} onClick={() => void withBusy(async () => { await setAssessWebhookEnabled(companyId, webhook.id, !webhook.enabled); await refresh(); setNotice(en ? "Webhook settings saved." : "Налаштування webhook збережено."); })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">{webhook.enabled ? (en ? "Pause" : "Призупинити") : (en ? "Enable" : "Увімкнути")}</button></article>)}</div>}
      <div className="mt-4 rounded-xl bg-bg-base p-3 text-xs leading-5 text-text-secondary"><strong>{en ? "Verify delivery signatures" : "Перевірка підпису доставки"}</strong><p className="mt-1">{en ? "HMAC-SHA256(secret, timestamp + '.' + raw request body); compare the hex digest after 'sha256='. Reject stale timestamps and deduplicate by X-StudyCod-Delivery." : "HMAC-SHA256(secret, timestamp + '.' + сире тіло запиту); порівняй hex digest після 'sha256='. Відхиляй застарілі timestamp і прибирай дублікати за X-StudyCod-Delivery."}</p></div>
    </section>

    {secret && <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-live="polite"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{secretLabel}</h2><p className="mt-1 text-xs text-text-secondary">{en ? "This value is shown only now. Store it in your ATS secret manager." : "Значення показується лише зараз. Збережи його у менеджері секретів ATS."}</p></div><button type="button" onClick={() => setSecret("")} className="text-xs font-semibold text-text-secondary">{en ? "Hide" : "Приховати"}</button></div><div className="mt-3 flex gap-2"><input readOnly value={secret} onFocus={event => event.currentTarget.select()} className={field + " mt-0 min-w-0 font-mono text-xs"}/><button type="button" onClick={() => void copySecret()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 text-xs font-semibold">{copied ? <Check className="size-4"/> : <Copy className="size-4"/>}{copied ? (en ? "Copied" : "Скопійовано") : (en ? "Copy" : "Копіювати")}</button></div></section>}
    {error && <p role="alert" className="rounded-xl border border-accent-error/30 bg-accent-error/5 p-3 text-sm text-accent-error">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{notice}</p>}
  </div>;
}
