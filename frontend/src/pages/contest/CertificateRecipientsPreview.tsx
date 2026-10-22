import React from "react";
import { Award, CircleAlert, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getContestAwards, type ContestAwardRow, type ContestAwards } from "../../lib/api/contestAwards";

function canReceiveCertificate(row: ContestAwardRow): boolean {
  return row.submissionCount > 0 && (!row.isDisqualified || row.retainParticipation);
}

function certificateLabel(row: ContestAwardRow, tr: (uk: string, en: string) => string): string {
  if (!canReceiveCertificate(row)) return tr("Не видається", "Not issued");
  if (row.awardPlace === 1) return tr("І місце", "1st place");
  if (row.awardPlace === 2) return tr("ІІ місце", "2nd place");
  if (row.awardPlace === 3) return tr("ІІІ місце", "3rd place");
  return tr("Учасник", "Participant");
}

function eligibilityNote(row: ContestAwardRow, tr: (uk: string, en: string) => string): string {
  if (row.submissionCount === 0) return tr("Немає подач", "No submissions");
  if (row.isDisqualified && !row.retainParticipation) return tr("Дискваліфікований", "Disqualified");
  if (row.isDisqualified && row.retainParticipation) return tr("Участь збережена · 0 балів", "Participation retained · 0 points");
  return tr(`Подач: ${row.submissionCount}`, `Submissions: ${row.submissionCount}`);
}

export function CertificateRecipientsPreview({ contestId }: { contestId: number }) {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language.startsWith("en") ? en : uk;
  const [data, setData] = React.useState<ContestAwards | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getContestAwards(contestId));
    } catch {
      setError(tr("Не вдалося завантажити список. Онови його ще раз.", "Could not load the list. Refresh and try again."));
    } finally {
      setLoading(false);
    }
  }, [contestId, i18n.language]);

  React.useEffect(() => { void load(); }, [load]);

  const rows = data ? (data.confirmed ? data.rows : data.suggested) : [];
  const recipients = rows.filter(canReceiveCertificate).length;
  const ready = Boolean(data?.confirmed && !data.stale);

  return <Card className="mb-4 overflow-hidden rounded-2xl border border-border bg-bg-surface/80">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary"><Award className="size-4 text-primary" aria-hidden="true" />{tr("Кому який диплом", "Certificate recipients")}</h3>
        <p className="mt-1 text-sm text-text-secondary">{tr("Перевір список перед запуском генерації.", "Review the list before starting generation.")}</p>
      </div>
      <Button variant="ghost" onClick={() => void load()} disabled={loading}>
        <RefreshCw className={`mr-2 size-4${loading ? " animate-spin" : ""}`} aria-hidden="true" />{tr("Оновити", "Refresh")}
      </Button>
    </div>

    <div className="px-4 pt-3 sm:px-5">
      {error ? <p role="alert" className="text-sm text-accent-error">{error}</p> : null}
      {loading && !data ? <p role="status" className="py-4 text-sm text-text-secondary">{tr("Завантажую розподіл…", "Loading allocation…")}</p> : null}
      {data && !ready ? <div className="mb-3 flex items-start gap-2 rounded-xl border border-accent-warn/30 bg-accent-warn/10 p-3 text-sm text-text-primary">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-warn" aria-hidden="true" />
        <span>{data.stale
          ? tr("Результати змінилися. Показано нову пропозицію — спершу підтвердь місця на вкладці «Учасники».", "Results have changed. This is the updated suggestion — confirm awards on the Participants tab first.")
          : tr("Це попередня пропозиція. Щоб дипломи відповідали списку, спершу підтвердь місця на вкладці «Учасники».", "This is a draft suggestion. Confirm awards on the Participants tab before generating certificates.")}
          {data.pendingSubmissions > 0 ? ` ${tr(`Ще перевіряються подачі: ${data.pendingSubmissions}.`, `Submissions still being judged: ${data.pendingSubmissions}.`)}` : ""}
        </span>
      </div> : null}
      {data && ready ? <p className="mb-3 text-sm text-accent-success">{tr("Підтверджений список: саме за ним буде сформовано дипломи.", "Confirmed list: certificates will be generated from these assignments.")}</p> : null}
    </div>

    {data && rows.length > 0 ? <>
      <div className="mx-4 mb-3 flex flex-wrap gap-2 sm:mx-5">
        <span className="rounded-full border border-border bg-bg-base px-3 py-1 text-xs font-semibold text-text-primary">{tr(`Дипломів: ${recipients}`, `Certificates: ${recipients}`)}</span>
        <span className="rounded-full border border-border bg-bg-base px-3 py-1 text-xs text-text-secondary">{tr(`Усього учасників: ${rows.length}`, `Participants: ${rows.length}`)}</span>
      </div>
      <div className="max-h-[380px] overflow-auto border-y border-border">
        <table className="w-full min-w-[540px] text-left text-sm">
          <caption className="sr-only">{tr("Учасники та дипломи, які їм буде видано", "Participants and the certificates they will receive")}</caption>
          <thead className="sticky top-0 z-10 bg-bg-surface text-xs uppercase tracking-wide text-text-secondary">
            <tr><th className="px-4 py-2.5 font-semibold sm:px-5">{tr("Учасник", "Participant")}</th><th className="px-3 py-2.5 font-semibold">{tr("Диплом", "Certificate")}</th><th className="px-4 py-2.5 font-semibold text-right sm:px-5">{tr("Статус", "Status")}</th></tr>
          </thead>
          <tbody>{rows.map(row => {
            const eligible = canReceiveCertificate(row);
            return <tr key={row.participantId} className="border-t border-border/70">
              <td className="px-4 py-2.5 font-medium text-text-primary sm:px-5">{row.displayName}</td>
              <td className="px-3 py-2.5"><span className={eligible ? "font-semibold text-text-primary" : "text-text-muted"}>{certificateLabel(row, tr)}</span></td>
              <td className="px-4 py-2.5 text-right text-xs text-text-secondary sm:px-5">{eligibilityNote(row, tr)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </> : data && !loading ? <p className="px-4 pb-4 text-sm text-text-secondary sm:px-5">{tr("У контесті поки немає учасників.", "There are no participants in this contest yet.")}</p> : null}
  </Card>;
}
