import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Logo } from "../Logo";

type PlatformFooterProps = {
  className?: string;
  compact?: boolean;
};

export const PlatformFooter: React.FC<PlatformFooterProps> = ({ className = "", compact = false }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const blogLabel = i18n.language?.toLowerCase().startsWith("en") ? "Blog" : "Девблог";

  return (
    <footer className={`border-t border-border bg-bg-surface/70 text-text-secondary ${className}`}>
      <div className={`px-4 md:px-6 py-4 flex gap-3 ${compact ? "flex-col items-start" : "flex-col md:flex-row md:items-center md:justify-between"}`}>
        <div className="inline-flex items-center gap-2 text-xs font-mono text-text-secondary">
          <Logo size={14} className="text-primary" />
          <span>{t("footerCopyright", { year })}</span>
        </div>

        <div className="text-[11px] font-mono text-text-muted">
          {t("footerTagline")}
        </div>

        <div className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/privacy")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {t("footerPrivacyPolicy")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/terms")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {t("footerTermsOfUse")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/cookies")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {t("footerCookiePolicy")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/blog")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {blogLabel}
          </button>
          <button
            type="button"
            onClick={() => navigate("/docs")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {t("help")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/support")}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-mono border border-border bg-bg-base/50 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {t("support")}
          </button>
        </div>
      </div>
    </footer>
  );
};
