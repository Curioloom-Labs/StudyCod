import React from "react";
import { ArrowUpRight, BookOpen, HeartHandshake, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Logo } from "../Logo";

type PlatformFooterProps = { className?: string; compact?: boolean };

export const PlatformFooter: React.FC<PlatformFooterProps> = ({ className = "", compact = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const links = [
    ["footerPrivacyPolicy", "/privacy"], ["footerTermsOfUse", "/terms"], ["footerCookiePolicy", "/cookies"],
    ["footerRefundPolicy", "/refunds"],
    ["blog", "/blog"], ["help", "/docs"], ["support", "/support"],
  ] as const;

  return <footer className={`border-t border-border/70 bg-bg-base text-text-secondary ${className}`}>
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-10">
      <div className={`flex gap-6 ${compact ? "flex-col" : "flex-col lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="max-w-sm"><div className="inline-flex items-center gap-2.5 text-sm font-bold text-text-primary"><span className="grid size-8 place-items-center rounded-xl bg-primary-strong text-primary-foreground"><Logo size={16} /></span>StudyCod</div><p className="mt-2 text-sm leading-6 text-text-muted">{t("footerTagline")}</p><a href="https://github.com/Curioloom-Labs" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition hover:text-primary-strong"><span>{t("footerParentBrand")}</span><ArrowUpRight className="size-3.5" /></a></div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold" aria-label="Footer navigation">{links.map(([label, href]) => <button key={href} type="button" onClick={() => navigate(href)} className="transition hover:text-primary-strong">{t(label)}</button>)}</nav>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-5 text-xs"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-primary-strong" />{t("footerCopyright", { year })}</span><span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5 text-accent-warn" />{t("footerTagline")}</span><a href="https://github.com/Curioloom-Labs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition hover:text-primary-strong"><HeartHandshake className="size-3.5 text-accent-error" />Curioloom Labs</a></div>
    </div>
  </footer>;
};
