import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ShieldX, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { getCertificateVerification, type CertificateVerification } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(locale);
}

export const CertificateVerifyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);
  const { certificateId } = useParams<{ certificateId?: string }>();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [item, setItem] = React.useState<CertificateVerification | null>(null);

  const load = React.useCallback(async () => {
    const id = String(certificateId ?? "").trim();
    if (!id) {
      setError(tr("Некоректний ID сертифіката", "Invalid certificate ID"));
      setItem(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getCertificateVerification(id);
      setItem(result);
    } catch (e: unknown) {
      setItem(null);
      setError(getErrorMessageFromUnknown(e, tr("Сертифікат не знайдено", "Certificate not found")));
    } finally {
      setLoading(false);
    }
  }, [certificateId, tr]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
      <Card className="p-5 border border-border/70 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="font-mono text-text-primary">{tr("Перевірка сертифіката", "Certificate verification")}</div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {tr("Оновити", "Refresh")}
          </Button>
        </div>
        <div className="text-xs text-text-secondary mt-2">
          ID: <span className="font-mono text-text-primary">{certificateId ?? "—"}</span>
        </div>
      </Card>

      <Card className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="text-sm text-accent-error">{error}</div>
        ) : !item ? (
          <div className="text-sm text-text-secondary">{tr("Сертифікат не знайдено", "Certificate not found")}</div>
        ) : (
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-sm ${item.status === "valid" ? "border-accent-success/50 bg-accent-success/10 text-accent-success" : "border-accent-error/50 bg-accent-error/10 text-accent-error"}`}>
              {item.status === "valid" ? <CheckCircle2 className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
              {item.status === "valid" ? tr("Сертифікат дійсний", "Certificate is valid") : tr("Сертифікат відкликано", "Certificate revoked")}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="border border-border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">{tr("Учасник", "Participant")}</div>
                <div className="text-text-primary font-mono">{item.name}</div>
              </div>
              <div className="border border-border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">{tr("Контест", "Contest")}</div>
                <div className="text-text-primary font-mono">{item.contestName}</div>
              </div>
              <div className="border border-border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">{tr("Бали", "Score")}</div>
                <div className="text-text-primary font-mono">{item.score}/{item.maxScore}</div>
              </div>
              <div className="border border-border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">{tr("Дата видачі", "Issued at")}</div>
                <div className="text-text-primary font-mono">{fmtDateTime(item.date, i18n.language)}</div>
              </div>
              <div className="border border-border rounded-lg px-3 py-2 md:col-span-2">
                <div className="text-text-secondary text-xs">{tr("Організатор", "Organizer")}</div>
                <div className="text-text-primary font-mono">{item.organizer}</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-3 text-xs text-text-secondary">
        <Link className="text-primary hover:underline" to="/">{tr("На головну", "Go home")}</Link>
      </div>
    </div>
  );
};

export default CertificateVerifyPage;
