import React from "react";
import { api } from "../../lib/api/client";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";

interface Props {
  orgId: number; userId: number; email: string | null;
  required?: boolean; canSetEmail?: boolean; disabled?: boolean;
  onUpdated: () => void | Promise<void>;
}

export function SchoolAccountActivation({ orgId, userId, email, required, canSetEmail, disabled, onUpdated }: Props) {
  const [editing, setEditing] = React.useState(false), [draft, setDraft] = React.useState(email || "");
  const [error, setError] = React.useState<string | null>(null), [saving, setSaving] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null), fieldId = React.useId();
  React.useEffect(() => { if (editing) input.current?.focus(); else setDraft(email || ""); }, [editing, email]);
  if (!required) return null;
  return <div className="w-full text-xs leading-5">
    <p className="text-text-muted">{tr("Очікує активації: власник установлює особистий пароль через пошту.", "Awaiting activation: the owner sets a personal password through email.")}</p>
    {canSetEmail && !editing && <button type="button" disabled={disabled} className="min-h-11 rounded-lg px-2 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" onClick={() => setEditing(true)}>
      {email ? tr("Уточнити email для активації", "Correct activation email") : tr("Додати email для активації", "Add activation email")}
    </button>}
    {editing && <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async event => {
      event.preventDefault(); if (saving || disabled) return; setSaving(true); setError(null);
      try { await api.patch(`/edu/orgs/${orgId}/members/${userId}/account-contact`, { email: draft.trim() }); }
      catch (failure) { setError(getEduErrorMessage(failure, tr("Не вдалося зберегти пошту", "Could not save email"))); setSaving(false); return; }
      setEditing(false);
      try { await onUpdated(); }
      catch (failure) { setError(getEduErrorMessage(failure, tr("Пошту збережено. Оновіть список учасників.", "Email saved. Refresh the member list."))); }
      finally { setSaving(false); }
    }}>
      <label htmlFor={fieldId} className="min-w-0 flex-1">{tr("Email власника акаунта", "Account owner's email")}
        <input ref={input} id={fieldId} type="email" autoComplete="email" required disabled={saving || disabled} value={draft} onChange={event => setDraft(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      </label>
      <button type="submit" disabled={saving || disabled} className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">{saving ? tr("Зберігаємо…", "Saving…") : tr("Зберегти email", "Save email")}</button>
      <button type="button" disabled={saving} className="min-h-11 rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setEditing(false)}>{tr("Скасувати", "Cancel")}</button>
    </form>}
    {error && <p role="alert" className="w-full text-accent-error">{error}</p>}
  </div>;
}
