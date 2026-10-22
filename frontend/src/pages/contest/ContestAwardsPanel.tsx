import React from "react";
import { useTranslation } from "react-i18next";
import { Award, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getContestAwards, confirmContestAwards, type ContestAwards, type ContestAwardRow, type AwardPlace } from "../../lib/api/contestAwards";

export function ContestAwardsPanel({ contestId, refreshKey }: { contestId: number; refreshKey: unknown }) {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language.startsWith("en") ? en : uk;
  const [data, setData] = React.useState<ContestAwards | null>(null);
  const [rows, setRows] = React.useState<ContestAwardRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const next = await getContestAwards(contestId);
      setData(next); setRows(next.rows); setDirty(false);
    } catch { setError(i18n.language.startsWith("en") ? "Could not load awards. Retry." : "Не вдалося завантажити розподіл місць. Спробуй ще раз."); }
    finally { setLoading(false); }
  }, [contestId, i18n.language]);
  React.useEffect(() => { void load(); }, [load, refreshKey]);
  const save = async () => {
    if (!data) return;
    setSaving(true); setError("");
    try {
      await confirmContestAwards(contestId, data.sourceVersion, rows);
      await load();
      setMessage(tr("Розподіл підтверджено. Можна генерувати дипломи.", "Awards confirmed. Certificates can now be generated."));
    } catch {
      setError(tr("Не вдалося підтвердити. Онови результати: подачі або статуси учасників могли змінитися.", "Could not confirm. Refresh results: submissions or participant statuses may have changed."));
    } finally { setSaving(false); }
  };
  return <Card className="p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-base font-semibold text-text-primary"><Award className="h-4 w-4" aria-hidden="true" />{tr("Місця та дипломи", "Awards and certificates")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">{tr("Запропонуй 1–3 місце за рейтингом або признач місця вручну. Можна нагородити кількох учасників одним місцем. Зміни набудуть чинності після підтвердження.", "Suggest the top three from standings or assign places manually. Multiple participants can share an award. Changes take effect after confirmation.")}</p></div>
      <Button variant="ghost" onClick={() => void load()} disabled={loading || saving}><RefreshCw className="mr-2 h-4 w-4" />{tr("Оновити", "Refresh")}</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-accent-error">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-accent-success">{message}</p>}
    {loading ? <p role="status" className="mt-4 text-sm text-text-secondary">{tr("Перевіряємо подачі…", "Checking submissions…")}</p> : data && <>
      <p className="mt-3 text-sm text-text-secondary">{data.stale ? tr("Результати змінилися. Потрібне нове підтвердження.", "Results changed. Confirm awards again.") : data.confirmed && !dirty ? tr("Розподіл підтверджено", "Awards confirmed") : tr("Чернетка: місця ще не підтверджено", "Draft: awards have not been confirmed")}</p>
      {!data.canConfirm && <p className="mt-2 text-sm text-accent-warn">{data.pendingSubmissions > 0 ? tr("Дочекайся перевірки всіх подач.", "Wait for all submissions to finish judging.") : tr("Підтвердження стане доступним після завершення контесту й додаткового часу учасників.", "Confirmation becomes available after the contest and all participant time extensions end.")}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={saving || !rows.length} onClick={() => { setRows(data.suggested); setDirty(true); setMessage(""); }}>{tr("Запропонувати автоматично", "Suggest automatically")}</Button>
        <Button variant="ghost" disabled={saving || !rows.length} onClick={() => { setRows(data.rows.map(r => ({ ...r, awardPlace: null }))); setDirty(true); setMessage(""); }}>{tr("Призначити вручну", "Assign manually")}</Button>
      </div>
      <div className="mt-4 overflow-auto"><table className="w-full min-w-[600px] text-left text-sm">
        <caption className="sr-only">{tr("Розподіл призових місць", "Award allocation")}</caption>
        <thead><tr className="text-text-secondary"><th className="p-2">{tr("Учасник", "Participant")}</th><th className="p-2">{tr("Рейтинг", "Rank")}</th><th className="p-2">{tr("Бали", "Score")}</th><th className="p-2">{tr("Участь", "Attendance")}</th><th className="p-2">{tr("Диплом", "Certificate")}</th></tr></thead>
        <tbody>{rows.map(row => {
          const excluded = row.submissionCount === 0 || (row.isDisqualified && !row.retainParticipation);
          return <tr key={row.participantId} className="border-t border-border"><td className="p-2 font-medium text-text-primary">{row.displayName}</td><td className="p-2 tabular-nums">{row.rank ?? "—"}</td><td className="p-2 tabular-nums">{row.totalScore}</td><td className="p-2 text-text-secondary">{row.submissionCount === 0 ? data.canConfirm || data.confirmed ? tr("Відсутній · немає подач", "Absent · no submissions") : tr("Ще немає подач", "No submissions yet") : row.isDisqualified ? row.retainParticipation ? tr("Участь збережено · 0 балів", "Participation retained · 0 points") : tr("Дискваліфіковано", "Disqualified") : tr(`Подач: ${row.submissionCount}`, `Submissions: ${row.submissionCount}`)}</td>
            <td className="p-2">{excluded ? <span className="text-text-muted">{tr("Не видається", "Not eligible")}</span> : <select aria-label={tr(`Диплом для ${row.displayName}`, `Certificate for ${row.displayName}`)} className="rounded-lg border border-border bg-bg-base px-2 py-2 text-text-primary" disabled={saving || row.isDisqualified} value={row.awardPlace ?? ""} onChange={e => { const place = e.target.value ? Number(e.target.value) as AwardPlace : null; setRows(prev => prev.map(r => r.participantId === row.participantId ? { ...r, awardPlace: place } : r)); setDirty(true); setMessage(""); }}>
              <option value="">{tr("Учасник", "Participant")}</option><option value="1">{tr("І місце", "1st place")}</option><option value="2">{tr("ІІ місце", "2nd place")}</option><option value="3">{tr("ІІІ місце", "3rd place")}</option>
            </select>}</td></tr>;
        })}</tbody>
      </table></div>
      {rows.length === 0 && <p className="py-4 text-sm text-text-secondary">{tr("Поки немає учасників", "No participants yet")}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => void save()} disabled={!data.canConfirm || saving || !rows.length || (data.confirmed && !dirty)}>{saving ? tr("Зберігаємо…", "Saving…") : tr("Підтвердити розподіл", "Confirm awards")}</Button><p className="text-xs text-text-muted">{tr("Без подач диплом не видається. Після зміни підтвердженого розподілу попередні дипломи потрібно згенерувати заново.", "Participants without submissions do not receive certificates. Changing confirmed awards requires regenerating existing certificates.")}</p></div>
    </>}
  </Card>;
}
