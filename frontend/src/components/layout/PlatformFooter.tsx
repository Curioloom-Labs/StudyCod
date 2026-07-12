import React from "react";
import { BookOpen, HeartHandshake, ShieldCheck } from "lucide-react";
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
    ["blog", "/blog"], ["help", "/docs"], ["support", "/support"],
  ] as const;

  return <footer className={`border-t border-[#17261b]/10 bg-[#eff3ef] text-[#5e6b62] dark:border-white/[.08] dark:bg-[#0d1510] dark:text-[#a8b4ab] ${className}`}>
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-10">
      <div className={`flex gap-6 ${compact ? "flex-col" : "flex-col lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="max-w-sm"><div className="inline-flex items-center gap-2.5 text-sm font-bold text-[#152219] dark:text-[#edf3ef]"><span className="grid size-8 place-items-center rounded-xl bg-[#173423] text-white"><Logo size={16} /></span>StudyCod</div><p className="mt-2 text-sm leading-6 text-[#6d7b71] dark:text-[#9eaca2]">{t("footerTagline")}</p></div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold" aria-label="Footer navigation">{links.map(([label, href]) => <button key={href} type="button" onClick={() => navigate(href)} className="transition hover:text-[#00894b] dark:hover:text-[#70edb0]">{t(label)}</button>)}</nav>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#17261b]/10 pt-5 text-xs dark:border-white/[.08]"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#00894b] dark:text-[#70edb0]" />{t("footerCopyright", { year })}</span><span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5 text-[#d57400] dark:text-[#ffb760]" />{t("footerTagline")}</span><span className="inline-flex items-center gap-1.5"><HeartHandshake className="size-3.5 text-[#d64e75] dark:text-[#ff91b7]" />StudyCod</span></div>
    </div>
  </footer>;
};
