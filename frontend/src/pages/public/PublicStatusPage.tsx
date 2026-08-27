import React from "react";
import { ArrowLeft, ArrowRight, CircleAlert, FileQuestion, Home, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import "../../i18n";
import { BrandLockup } from "../../components/BrandLockup";
import { Logo } from "../../components/Logo";
import { PublicProductNav } from "../../components/layout/PublicProductNav";

export type PublicStatusVariant = "not-found" | "error";

type PublicStatusPageProps = {
  variant: PublicStatusVariant;
  error?: Error;
};

const copy = {
  "not-found": {
    status: "404",
    code: "ROUTE_NOT_FOUND",
    eyebrowUk: "Маршрут не знайдено",
    eyebrowEn: "Route not found",
    titleUk: "Схоже, ця сторінка пішла в інший бік.",
    titleEn: "Looks like this page took a different route.",
    bodyUk: "Посилання може бути застарілим або сторінка ще не встигла з’явитися. Повернімося до місця, де навчання продовжується.",
    bodyEn: "The link may be outdated, or the page has not arrived yet. Let’s get you back to where learning continues.",
    marker: "null",
  },
  error: {
    status: "500",
    code: "RUNTIME_ERROR",
    eyebrowUk: "Потрібна ще одна спроба",
    eyebrowEn: "One more try needed",
    titleUk: "Щось збилося в нашому коді.",
    titleEn: "Something tripped in our code.",
    bodyUk: "Ми вже бачимо проблему. Оновіть сторінку — зазвичай цього достатньо, щоб повернутися до навчання.",
    bodyEn: "We can see the problem. Refresh the page — that is usually enough to get back to learning.",
    marker: "retry",
  },
} as const;

export const PublicStatusPage: React.FC<PublicStatusPageProps> = ({ variant, error }) => {
  const { i18n } = useTranslation();
  const isEnglish = i18n.language?.toLowerCase().startsWith("en");
  const tr = (uk: string, en: string) => isEnglish ? en : uk;
  const content = copy[variant];
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  const devDetail = import.meta.env.DEV && error?.message ? error.message : null;

  return (
    <div id="studycod-status" className="min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(0,255,136,0.08),transparent_30rem)] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[radial-gradient(circle_at_50%_-10%,rgba(0,255,136,0.055),transparent_32rem)] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav />

      <main id="main-content" className="relative isolate mx-auto flex min-h-[calc(100dvh-74px)] w-[min(1240px,calc(100%_-_48px))] items-center py-16 max-md:min-h-[calc(100dvh-64px)] max-md:w-[calc(100%_-_28px)] max-md:py-12">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,255,136,.1),rgba(255,180,84,.035)_42%,transparent_70%)] blur-3xl" />

        <section className="grid w-full items-center gap-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-20">
          <div className="max-w-[610px]">
            <div className="mb-6 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.16em] text-[#007f48] dark:text-[#68efb0]">
              <span className="h-px w-8 bg-[#00b963]/50" />
              {isEnglish ? content.eyebrowEn : content.eyebrowUk}
            </div>
            <div className="font-mono text-[clamp(74px,12vw,148px)] font-bold leading-[.78] tracking-[-.1em] text-[#111814] dark:text-[#edf3ef]">
              {content.status}<span className="text-[#00b963]">.</span>
            </div>
            <h1 className="mt-9 max-w-[640px] text-balance text-[clamp(36px,4.4vw,60px)] font-bold leading-[1.03] tracking-[-.055em]">
              {isEnglish ? content.titleEn : content.titleUk}
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-7 text-[#667169] dark:text-[#a4afa7]">
              {isEnglish ? content.bodyEn : content.bodyUk}
            </p>

            <div className="mt-8 flex flex-wrap gap-3 max-md:flex-col">
              <a href="/" className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-[#00ff88] px-6 text-sm font-bold text-[#07140d] shadow-[0_14px_32px_rgba(0,185,99,0.19)] transition hover:-translate-y-0.5 hover:bg-[#24ff9a] hover:shadow-[0_18px_38px_rgba(0,185,99,0.27)] max-md:w-full">
                <Home className="size-4" />
                {tr("На головну", "Back to home")}
                <ArrowRight className="size-4" />
              </a>
              <button type="button" onClick={() => window.location.reload()} className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#122017]/10 bg-white px-6 text-sm font-bold shadow-[0_12px_30px_rgba(18,32,23,0.05)] transition hover:-translate-y-0.5 hover:border-[#00b963]/35 dark:border-white/10 dark:bg-[#182019] dark:shadow-[0_12px_30px_rgba(0,0,0,.18)] max-md:w-full">
                <RefreshCw className="size-4 text-[#00a85c]" />
                {tr("Спробувати ще раз", "Try again")}
              </button>
            </div>

            <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#667169] transition hover:text-[#111814] dark:text-[#a4afa7] dark:hover:text-white">
              <ArrowLeft className="size-3.5" />
              {tr("Повернутися назад", "Go back")}
            </button>
          </div>

          <div className="relative mx-auto w-full max-w-[590px]">
            <div className="absolute -right-7 -top-8 size-24 rounded-full border border-[#ffb454]/25 bg-[#ffb454]/10 blur-[1px] max-md:-right-2" />
            <div className="relative overflow-hidden rounded-[30px] border border-[#122017]/10 bg-white shadow-[0_35px_90px_rgba(18,32,23,.12)] dark:border-white/10 dark:bg-[#121a15] dark:shadow-[0_35px_90px_rgba(0,0,0,.3)]">
              <div className="flex h-14 items-center justify-between border-b border-[#122017]/10 bg-[#f8faf7] px-5 dark:border-white/10 dark:bg-[#172119]">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-xl bg-[#173423] text-white"><Logo size={20} /></span>
                  <span className="font-mono text-[11px] text-[#667169] dark:text-[#9eaca2]">studycod.space</span>
                </div>
                <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[.08em] text-[#ad6900]">
                  <span className="size-2 rounded-full bg-[#ffb454]" />{content.code}
                </span>
              </div>

              <div className="p-6 sm:p-8">
                <div className="rounded-[22px] border border-[#122017]/10 bg-[#f5f8f5] p-5 font-mono text-xs dark:border-white/10 dark:bg-[#0f1712]">
                  <div className="flex items-center gap-2 text-[#7a887e]"><span className="text-[#00a85c]">$</span> studycod route resolve <span className="text-[#667169]">{path}</span></div>
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-lg bg-[#00ff88]/15 text-[#00834a] dark:text-[#68efb0]">✓</span><span className="text-[#526157] dark:text-[#b8c6bb]">request.received</span><span className="ml-auto text-[#7a887e]">12ms</span></div>
                    <div className="ml-3 h-5 border-l border-dashed border-[#00b963]/35" />
                    <div className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-lg bg-[#ffb454]/15 text-[#ad6900]"><CircleAlert className="size-3.5" /></span><span className="text-[#526157] dark:text-[#b8c6bb]">{variant === "not-found" ? "route.match" : "runtime.recover"}</span><span className="ml-auto text-[#ad6900]">{content.status}</span></div>
                    <div className="ml-3 h-5 border-l border-dashed border-[#ffb454]/45" />
                    <div className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-lg bg-[#e7ebea] text-[#7a887e] dark:bg-white/10"><FileQuestion className="size-3.5" /></span><span className="text-[#7a887e]">{content.marker}</span><span className="ml-auto text-[#7a887e]">{tr("наступний крок", "next step")}</span></div>
                  </div>
                </div>
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#00b963]/15 bg-[#00ff88]/[.06] p-4 text-sm leading-6 text-[#526157] dark:text-[#c1cdc4]">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-[#00b963]" />
                  <span>{tr("Навчальний прогрес збережено. Можна спокійно повернутися до наступної спроби.", "Your learning progress is safe. You can calmly return to the next attempt.")}</span>
                </div>
                {devDetail && <pre className="mt-5 max-h-24 overflow-auto rounded-xl border border-[#ffb454]/20 bg-[#fff7e9] p-3 text-[10px] leading-5 text-[#7a4d00]">{devDetail}</pre>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#122017]/10 dark:border-white/10">
        <div className="mx-auto flex w-[min(1120px,calc(100%_-_48px))] items-center justify-between gap-5 py-7 text-xs text-[#667169] dark:text-[#9eaca2] max-md:w-[calc(100%_-_28px)] max-md:flex-col max-md:items-start">
          <a href="/" className="transition hover:text-[#111814] dark:hover:text-white"><BrandLockup compact /></a>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/docs" className="transition hover:text-[#00894b] dark:hover:text-[#70edb0]">{tr("Документація", "Documentation")}</a>
            <a href="/support" className="transition hover:text-[#00894b] dark:hover:text-[#70edb0]">{tr("Підтримка", "Support")}</a>
            <span>© {new Date().getFullYear()} StudyCod · Curioloom Labs</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const PublicNotFoundPage: React.FC = () => <PublicStatusPage variant="not-found" />;
export const PublicErrorPage: React.FC<{ error?: Error }> = ({ error }) => <PublicStatusPage variant="error" error={error} />;

export default PublicStatusPage;
