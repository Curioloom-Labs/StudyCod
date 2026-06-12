import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Award, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { getMyCertificates, type ProfileCertificate } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

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
  const prefersReducedMotion = useReducedMotion();

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
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="space-y-2"
      >
        <span className="font-mono text-xs text-primary/70">{tr("// сертифікати", "// certificates")}</span>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{tr("Мої сертифікати", "My certificates")}</h1>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {tr("Оновити", "Refresh")}
          </Button>
        </div>
        <p className="text-sm text-text-secondary max-w-xl">
          {tr("Тут зібрані всі згенеровані сертифікати з контестів.", "All generated contest certificates are listed here.")}
        </p>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-accent-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 px-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="w-5 h-5 text-primary" />
          </div>
          <div className="text-sm text-text-secondary max-w-sm">{tr("Поки що сертифікатів немає.", "No certificates yet.")}</div>
        </div>
      ) : (
        <motion.div
          variants={prefersReducedMotion ? undefined : staggerContainer}
          initial={prefersReducedMotion ? undefined : "initial"}
          animate={prefersReducedMotion ? undefined : "animate"}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {rows.map((row) => {
            const isValid = String(row.status ?? "").toLowerCase() === "valid";
            return (
              <motion.div
                key={row.certificateId}
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                className="group rounded-xl border border-primary/30 bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Award className="w-4 h-4 text-primary shrink-0" />
                    <div className="font-semibold text-text-primary truncate">{row.contestTitle}</div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono uppercase tracking-[0.06em] ${
                      isValid ? "text-accent-success bg-accent-success/10" : "text-accent-error bg-accent-error/10"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                <div className="h-px bg-gradient-to-r from-primary/30 via-border to-transparent my-3" />

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm">
                  <span className="text-text-secondary">
                    {tr("Бали", "Score")}: <span className="text-text-primary font-semibold">{row.score}/{row.maxScore}</span>
                  </span>
                  <span className="text-text-secondary">
                    {tr("Місце", "Place")}: <span className="text-text-primary font-semibold">{row.place ?? "—"}</span>
                  </span>
                </div>

                <div className="mt-2 font-mono text-xs text-text-muted">
                  {tr("Видано", "Issued")}: {fmtDateTime(row.issuedAt ?? row.createdAt, i18n.language)}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">ID: {row.certificateId}</span>
                  <Link
                    className="inline-flex items-center gap-1.5 text-sm font-mono text-primary opacity-70 group-hover:opacity-100 transition-fast"
                    to={`/certificate/${encodeURIComponent(row.certificateId)}`}
                  >
                    {tr("Перевірити", "Verify")}
                    <ArrowRight className="w-4 h-4 transition-fast group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};

export default ProfileCertificatesPage;
