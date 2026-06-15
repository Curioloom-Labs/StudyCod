import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, ShieldX, RefreshCw, BadgeCheck, ArrowLeft } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { getCertificateVerification, type CertificateVerification } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { easeOutQuint } from "../../lib/motion";

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
  const prefersReducedMotion = useReducedMotion();

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
    <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto space-y-6">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="space-y-2"
      >
        <PageEyebrow label={tr("Сертифікат", "Certificate verification")} />
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{tr("Сертифікат", "Certificate")}</h1>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {tr("Оновити", "Refresh")}
          </Button>
        </div>
        <div className="text-xs font-mono text-text-muted">
          ID: <span className="text-text-secondary">{certificateId ?? "—"}</span>
        </div>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      <Card className="p-5 rounded-xl border-primary/30">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="text-sm text-accent-error">{error}</div>
        ) : !item ? (
          <div className="rounded-xl border border-dashed border-border py-10 px-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldX className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm text-text-secondary">{tr("Сертифікат не знайдено", "Certificate not found")}</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm ${item.status === "valid" ? "border-accent-success/50 bg-accent-success/10 text-accent-success" : "border-accent-error/50 bg-accent-error/10 text-accent-error"}`}>
              {item.status === "valid" ? <CheckCircle2 className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
              {item.status === "valid" ? tr("Сертифікат дійсний", "Certificate is valid") : tr("Сертифікат відкликано", "Certificate revoked")}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 transition-fast hover:border-primary/40">
                <div className="text-text-muted text-xs font-mono uppercase tracking-[0.06em]">{tr("Учасник", "Participant")}</div>
                <div className="text-text-primary font-mono mt-0.5">{item.name}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 transition-fast hover:border-primary/40">
                <div className="text-text-muted text-xs font-mono uppercase tracking-[0.06em]">{tr("Контест", "Contest")}</div>
                <div className="text-text-primary font-mono mt-0.5">{item.contestName}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 transition-fast hover:border-primary/40">
                <div className="text-text-muted text-xs font-mono uppercase tracking-[0.06em]">{tr("Бали", "Score")}</div>
                <div className="text-text-primary font-mono mt-0.5">{item.score}/{item.maxScore}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 transition-fast hover:border-primary/40">
                <div className="text-text-muted text-xs font-mono uppercase tracking-[0.06em]">{tr("Дата видачі", "Issued at")}</div>
                <div className="text-text-primary font-mono mt-0.5">{fmtDateTime(item.date, i18n.language)}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface px-3 py-2 md:col-span-2 transition-fast hover:border-primary/40">
                <div className="text-text-muted text-xs font-mono uppercase tracking-[0.06em]">{tr("Організатор", "Organizer")}</div>
                <div className="text-text-primary font-mono mt-0.5">{item.organizer}</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="text-xs font-mono">
        <Link className="inline-flex items-center gap-1.5 text-primary hover:underline" to="/">
          <ArrowLeft className="w-3.5 h-3.5" />
          {tr("На головну", "Go home")}
        </Link>
      </div>
    </div>
  );
};

export default CertificateVerifyPage;
