import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, CheckCircle2, RefreshCw, ShieldX } from "lucide-react";
import { getMyCertificates, type ProfileCertificate } from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { ProfileSectionNav } from "../../components/profile/ProfileSectionNav";

const devPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const previewCertificates: ProfileCertificate[] = [
  { certificateId: "SC-2026-PY-0142", contestId: 42, contestTitle: "Python Spring Challenge", participantName: "Оксана Мельник", score: 92, maxScore: 100, place: "12", organizer: "StudyCod", status: "valid", issuedAt: "2026-04-18T10:00:00.000Z", pdfStorageKey: null, createdAt: "2026-04-18T10:00:00.000Z" },
  { certificateId: "SC-2026-ALG-0087", contestId: 37, contestTitle: "Algorithms Week", participantName: "Оксана Мельник", score: 86, maxScore: 100, place: "28", organizer: "StudyCod", status: "valid", issuedAt: "2026-02-07T10:00:00.000Z", pdfStorageKey: null, createdAt: "2026-02-07T10:00:00.000Z" },
];

const formatDate = (value: string | null | undefined, locale: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
};

export const ProfileCertificatesPage: React.FC = () => {
  const english = !navigator.language.toLowerCase().startsWith("uk");
  const copy = (uk: string, en: string) => english ? en : uk;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [certificates, setCertificates] = React.useState<ProfileCertificate[]>([]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    if (devPreview()) {
      setCertificates(previewCertificates);
      setLoading(false);
      return;
    }
    try {
      const response = await getMyCertificates();
      setCertificates(response.certificates ?? []);
    } catch (cause) {
      setCertificates([]);
      setError(getErrorMessageFromUnknown(cause, copy("Не вдалося завантажити сертифікати.", "Could not load certificates.")));
    } finally {
      setLoading(false);
    }
  }, [english]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="min-h-[100dvh] bg-[#f5f7f4] text-[#17231b] dark:bg-[#101a13] dark:text-[#edf4ef]">
      <main className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
        <ProfileSectionNav
          active="certificates"
          className="mb-6"
          action={(
            <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#173321] px-4 text-sm font-semibold text-white transition hover:bg-[#20462d] disabled:opacity-50 dark:bg-[#edf4ef] dark:text-[#0b120d]">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {copy("Оновити", "Refresh")}
            </button>
          )}
        />

        <section className="relative overflow-hidden rounded-[30px] bg-[#1a2d20] px-6 py-8 text-white shadow-[0_26px_58px_-38px_rgba(0,0,0,.85)] sm:px-9 sm:py-10">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-[#ffd93d]/10 blur-3xl" />
          <div className="absolute -bottom-28 left-10 size-72 rounded-full bg-[#00ff88]/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#8df0bc]">
                <Award className="size-4" />
                {copy("Досягнення", "Achievements")}
              </span>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-5xl">
                {copy("Твої сертифікати", "Your certificates")}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#b6c6b9]">
                {copy("Підтвердження завершених контестів і результатів зібрані тут. Звідси можна повернутися в профіль або відкрити IAD.", "Verified records of completed contests and your results live here. You can return to profile or open IAD from here.")}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[#627166] dark:text-[#a4b3a8]">
              {loading ? copy("Оновлюємо список…", "Updating your list…") : copy(`${certificates.length} доступно`, `${certificates.length} available`)}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#ff6b9d]/30 bg-[#fff1f5] p-4 text-sm text-[#b83259] dark:bg-[#ff6b9d]/10 dark:text-[#ffabc4]">{error}</div>
          ) : loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-[24px] bg-[#e6ece7] dark:bg-white/[.055]" />)}
            </div>
          ) : certificates.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-[#152219]/15 bg-white p-8 text-center dark:border-white/10 dark:bg-[#18231b]">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f6ed] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]">
                  <Award className="size-6" />
                </span>
                <h2 className="mt-5 text-xl font-semibold">{copy("Сертифікатів ще немає", "No certificates yet")}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d7c71] dark:text-[#a2b1a6]">
                  {copy("Після успішного контесту тут з’явиться верифікований результат.", "A verified record will appear here after a successful contest.")}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {certificates.map((certificate) => {
                const valid = String(certificate.status).toLowerCase() === "valid";
                return (
                  <article key={certificate.certificateId} className="group relative overflow-hidden rounded-[24px] border border-[#152219]/10 bg-white p-5 shadow-[0_20px_45px_-38px_rgba(11,31,17,.55)] transition hover:-translate-y-1 hover:border-[#00c96d]/35 dark:border-white/10 dark:bg-[#18231b]">
                    <div className="absolute right-0 top-0 size-28 translate-x-8 -translate-y-8 rounded-full bg-[#00ff88]/[.07]" />
                    <div className="relative flex items-start justify-between gap-4">
                      <span className={`grid size-11 place-items-center rounded-2xl ${valid ? "bg-[#e8f6ed] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]" : "bg-[#fff0f4] text-[#d34e72] dark:bg-[#ff6b9d]/10 dark:text-[#ff9abb]"}`}>
                        {valid ? <Award className="size-5" /> : <ShieldX className="size-5" />}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${valid ? "bg-[#e9f8ee] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]" : "bg-[#fff0f4] text-[#c84268] dark:bg-[#ff6b9d]/10 dark:text-[#ff9abb]"}`}>
                        {valid && <CheckCircle2 className="size-3.5" />}
                        {certificate.status}
                      </span>
                    </div>
                    <h2 className="relative mt-6 text-xl font-semibold tracking-[-.03em]">{certificate.contestTitle}</h2>
                    <div className="relative mt-5 grid grid-cols-3 gap-3 border-y border-[#152219]/8 py-4 text-sm dark:border-white/[.08]">
                      <div><div className="text-xs text-[#78867c] dark:text-[#98a89c]">{copy("Бали", "Score")}</div><strong className="mt-1 block">{certificate.score}/{certificate.maxScore}</strong></div>
                      <div><div className="text-xs text-[#78867c] dark:text-[#98a89c]">{copy("Місце", "Place")}</div><strong className="mt-1 block">{certificate.place ?? "—"}</strong></div>
                      <div><div className="text-xs text-[#78867c] dark:text-[#98a89c]">ID</div><strong className="mt-1 block truncate">{certificate.certificateId}</strong></div>
                    </div>
                    <div className="relative mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-[#78867c] dark:text-[#98a89c]">{formatDate(certificate.issuedAt ?? certificate.createdAt, english ? "en-US" : "uk-UA")}</span>
                      <Link to={`/certificate/${encodeURIComponent(certificate.certificateId)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#147b47] transition group-hover:gap-2.5 dark:text-[#71edaf]">
                        {copy("Перевірити", "Verify")}
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ProfileCertificatesPage;
