import React from "react";
import { ArrowUpRight, HeartHandshake, ShieldCheck } from "lucide-react";
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
    <div className="mx-auto max-w-[1480px] px-4 py-3 sm:px-6 sm:py-4 lg:px-10">
      <div className={`flex gap-2 ${compact ? "flex-col" : "flex-col lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-text-primary"><span className="grid size-7 place-items-center rounded-lg bg-[#173423]"><Logo size={14} /></span>StudyCod</span>
          <span className="text-xs text-text-muted sm:text-sm">{t("footerTagline")}</span>
        </div>
        <nav className="flex flex-wrap gap-x-2 gap-y-0 text-xs font-semibold sm:gap-x-3 sm:text-[13px]" aria-label="Footer navigation">
          {links.map(([label, href]) => <button key={href} type="button" onClick={() => navigate(href)} className="inline-flex min-h-11 items-center rounded-lg px-1.5 transition-colors hover:text-primary-strong motion-reduce:transition-none lg:min-h-9">{t(label)}</button>)}
        </nav>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 pt-3 text-xs">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-text-muted" />{t("footerCopyright", { year })}</span>
        <a href="https://github.com/Curioloom-Labs" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 transition-colors hover:text-primary-strong motion-reduce:transition-none"><HeartHandshake className="size-3.5 text-text-muted" />Curioloom Labs<ArrowUpRight className="size-3" /></a>
      </div>
    </div>
  </footer>;
};
