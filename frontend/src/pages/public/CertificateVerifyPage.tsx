import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CheckCircle2, RefreshCw, ShieldX } from "lucide-react";
import { PublicProductNav } from "../../components/layout/PublicProductNav";
import { getCertificateVerification, type CertificateVerification } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const formatDate = (value: string | null | undefined, locale: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
};

export const CertificateVerifyPage: React.FC = () => {
  const { certificateId = "" } = useParams<{ certificateId: string }>();
  const english = !navigator.language.toLowerCase().startsWith("uk");
  const copy = (uk: string, en: string) => english ? en : uk;
  const [loading, setLoading] = React.useState(true);
  const [certificate, setCertificate] = React.useState<CertificateVerification | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setCertificate(await getCertificateVerification(certificateId)); }
    catch (cause) { setCertificate(null); setError(getErrorMessageFromUnknown(cause, copy("Сертифікат не знайдено.", "Certificate was not found."))); }
    finally { setLoading(false); }
  }, [certificateId, english]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const valid = certificate?.status === "valid";
  return <div className="min-h-[100dvh] bg-[#f5f7f4] text-[#17231b] dark:bg-[#09100c] dark:text-[#edf4ef]"><PublicProductNav /><main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16"><Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#617166] transition hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:text-white"><ArrowLeft className="size-4" />{copy("На головну", "Back home")}</Link><section className="relative mt-7 overflow-hidden rounded-[30px] border border-[#152219]/10 bg-white p-6 shadow-[0_28px_65px_-46px_rgba(10,35,18,.7)] dark:border-white/10 dark:bg-[#121b15] sm:p-10"><div className={`absolute -right-20 -top-24 size-80 rounded-full blur-3xl ${loading ? "bg-[#00ff88]/[.07]" : valid ? "bg-[#00ff88]/[.1]" : "bg-[#ff6b9d]/[.09]"}`} /><div className="relative flex flex-col gap-7"><div className="flex items-start justify-between gap-4"><div><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#147b47] dark:text-[#71edaf]"><BadgeCheck className="size-4" />{copy("Перевірка сертифіката", "Certificate verification")}</span><h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-5xl">{loading ? copy("Перевіряємо запис", "Checking record") : valid ? copy("Сертифікат дійсний", "Certificate is valid") : copy("Статус сертифіката", "Certificate status")}</h1><p className="mt-3 text-sm text-[#718075] dark:text-[#a3b1a6]">ID: {certificateId || "—"}</p></div><button type="button" onClick={() => void refresh()} disabled={loading} className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#edf3ee] text-[#526258] transition hover:bg-[#e3ece5] disabled:opacity-50 dark:bg-white/[.07] dark:text-[#b7c5bb]"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button></div>{loading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-[#edf2ed] dark:bg-white/[.045]" />)}</div> : error ? <div className="rounded-2xl border border-[#ff6b9d]/30 bg-[#fff1f5] p-5 text-sm text-[#b83259] dark:bg-[#ff6b9d]/10 dark:text-[#ffabc4]">{error}</div> : certificate ? <><div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${valid ? "bg-[#e9f8ee] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]" : "bg-[#fff0f4] text-[#c84268] dark:bg-[#ff6b9d]/10 dark:text-[#ff9abb]"}`}>{valid ? <CheckCircle2 className="size-4" /> : <ShieldX className="size-4" />}{valid ? copy("Підтверджено StudyCod", "Verified by StudyCod") : copy("Запис відкликано", "Record has been revoked")}</div><div className="grid gap-3 sm:grid-cols-2">{[[copy("Учасник", "Participant"), certificate.name],[copy("Контест", "Contest"), certificate.contestName],[copy("Результат", "Score"), `${certificate.score}/${certificate.maxScore}`],[copy("Дата видачі", "Issued"), formatDate(certificate.date, english ? "en-US" : "uk-UA")],[copy("Організатор", "Organizer"), certificate.organizer]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f4f7f4] p-4 dark:bg-white/[.045]"><div className="text-xs font-semibold uppercase tracking-[.12em] text-[#7b897f] dark:text-[#9eada2]">{label}</div><div className="mt-2 text-base font-semibold">{value || "—"}</div></div>)}</div></> : null}</div></section></main></div>;
};
