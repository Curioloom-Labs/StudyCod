import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import type { ContestAdminParticipant } from "../../lib/api/contests";

export function ContestDisqualificationDialog({ participant, onClose, onConfirm }: {
  participant: ContestAdminParticipant;
  onClose: () => void;
  onConfirm: (options: { retainParticipation: boolean; reason: string }) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language.startsWith("en") ? en : uk;
  const [mode, setMode] = React.useState<"retain" | "full" | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return <Modal open title={tr("Дискваліфікація учасника", "Disqualify participant")} description={participant.displayName} onClose={onClose} closable={!busy}>
    <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-sm text-text-secondary">{tr("Чи залишити участь для диплому?", "Keep participation for a certificate?")}</legend>
      {([ ["retain", tr("Залишити як учасника", "Retain participation"), tr("Результат у заліку — 0 балів. Доступний лише диплом учасника, якщо була хоча б одна подача.", "The standings show 0 points. A participation certificate is available if they submitted at least once.")], ["full", tr("Повна дискваліфікація", "Full disqualification"), tr("Виключити із заліку та не видавати диплом. Подачі й рішення залишаться в історії.", "Exclude from standings and certificates. Submissions and the decision remain in the history.")] ] as const).map(([value, title, copy]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${mode === value ? "border-primary bg-bg-hover" : "border-border"}`}><input type="radio" name="disqualification-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" /><span><span className="block text-sm font-semibold text-text-primary">{title}</span><span className="mt-1 block text-sm text-text-secondary">{copy}</span></span></label>)}
      <label className="block text-sm text-text-secondary">{tr("Причина (необов’язково)", "Reason (optional)")}<textarea className="mt-2 w-full rounded-xl border border-border bg-bg-base p-3 text-text-primary" rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    </fieldset>
    <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{tr("Скасувати", "Cancel")}</Button><Button disabled={!mode || busy} onClick={async () => { if (!mode) return; setBusy(true); try { await onConfirm({ retainParticipation: mode === "retain", reason }); } finally { setBusy(false); } }}>{busy ? tr("Зберігаємо…", "Saving…") : tr("Дискваліфікувати", "Disqualify")}</Button></div>
  </Modal>;
}
