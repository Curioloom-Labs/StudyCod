import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Award, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { getMyCertificates, type ProfileCertificate } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(locale);
}

export const ProfileCertificatesPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ProfileCertificate[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMyCertificates();
      setRows(Array.isArray(result.certificates) ? result.certificates : []);
    } catch (e: unknown) {
      setError(getErrorMessageFromUnknown(e, tr("Не вдалося завантажити сертифікати", "Failed to load certificates")));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tr]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto">
      <Card className="p-4 border border-border/70 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-text-primary font-mono">
            <Award className="w-5 h-5 text-primary" />
            {tr("Мої сертифікати", "My certificates")}
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {tr("Оновити", "Refresh")}
          </Button>
        </div>
        <div className="text-xs text-text-secondary mt-2">
          {tr("Тут зібрані всі згенеровані сертифікати з контестів.", "All generated contest certificates are listed here.")}
        </div>
      </Card>

      <Card className="p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-accent-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-text-secondary">{tr("Поки що сертифікатів немає.", "No certificates yet.")}</div>
        ) : (
          <div className="overflow-auto border border-border">
            <table className="min-w-[620px] md:min-w-[860px] w-full text-xs sm:text-sm font-mono">
              <caption className="sr-only">
                {tr("Список сертифікатів користувача", "List of user certificates")}
              </caption>
              <thead className="bg-bg-hover">
                <tr>
                  <th className="hidden md:table-cell p-2 border-b border-border text-left">ID</th>
                  <th className="p-2 border-b border-border text-left">{tr("Контест", "Contest")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Бали", "Score")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Місце", "Place")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Статус", "Status")}</th>
                  <th className="hidden lg:table-cell p-2 border-b border-border text-center">{tr("Видано", "Issued")}</th>
                  <th className="p-2 border-b border-border text-right">{tr("Дії", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.certificateId} className="odd:bg-bg-base even:bg-bg-surface">
                    <td className="hidden md:table-cell p-2 border-b border-border">{row.certificateId}</td>
                    <td className="p-2 border-b border-border">{row.contestTitle}</td>
                    <td className="p-2 border-b border-border text-center">{row.score}/{row.maxScore}</td>
                    <td className="p-2 border-b border-border text-center">{row.place ?? "—"}</td>
                    <td className="p-2 border-b border-border text-center">{row.status}</td>
                    <td className="hidden lg:table-cell p-2 border-b border-border text-center">{fmtDateTime(row.issuedAt ?? row.createdAt, i18n.language)}</td>
                    <td className="p-2 border-b border-border text-right">
                      <Link
                        className="text-primary hover:underline"
                        to={`/certificate/${encodeURIComponent(row.certificateId)}`}
                      >
                        {tr("Перевірити", "Verify")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProfileCertificatesPage;
