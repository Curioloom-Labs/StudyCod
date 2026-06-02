import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { GraduationCap, User, Library, BookOpen, ShieldCheck, Sparkles, Rocket, CheckCircle2, Timer, MessageCircleQuestion } from "lucide-react";
import { applyTheme, getCurrentTheme } from "../../theme";

export const PublicLandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const topMenuButtonClass = "inline-flex h-8 items-center justify-center rounded-md border border-border/80 bg-bg-code/70 px-3 text-[11px] font-mono uppercase tracking-[0.08em] text-text-secondary transition-fast hover:-translate-y-[1px] hover:border-primary/50 hover:bg-bg-hover/80 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/60";
  const [theme, setTheme] = React.useState<"dark" | "light">(() => getCurrentTheme());

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary">
      <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Logo size={28} className="text-primary" />
          <span className="text-lg font-mono text-text-primary">StudyCod</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-bg-code/35 p-1.5">
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
            className={topMenuButtonClass}
            title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
          >
            {i18n.language === "uk" ? "EN" : "UA"}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              applyTheme(next);
              setTheme(next);
            }}
            className={topMenuButtonClass}
            title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>

          <button type="button" className={topMenuButtonClass} onClick={() => navigate("/docs")}>{t("help")}</button>
        </div>
      </header>

      <main className="px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,0.8fr] gap-8 items-start">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 border border-border bg-bg-code text-xs font-mono text-text-secondary">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t("landingBadge")}
                </div>

                <h1 className="text-3xl md:text-4xl font-mono text-text-primary leading-tight">
                  {t("landingTitle")}
                </h1>

                <p className="text-sm md:text-base font-mono text-text-secondary max-w-2xl">
                  {t("landingSubtitle")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => navigate("/?auth=register")}>{t("landingCtaRegister")}</Button>
                <Button variant="secondary" onClick={() => navigate("/?auth=login")}>{t("landingCtaLogin")}</Button>
                <Button variant="ghost" onClick={() => navigate("/?auth=login&next=%2Flibrary")}>{t("landingCtaLibrary")}</Button>
              </div>

              <div className="text-xs font-mono text-text-muted">
                {t("landingNote")}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-start gap-3 p-3 border border-border bg-bg-surface/40">
                  <Timer className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <div className="text-xs font-mono text-text-primary">{t("landingMiniFastTitle")}</div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">{t("landingMiniFastBody")}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border border-border bg-bg-surface/40">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <div className="text-xs font-mono text-text-primary">{t("landingMiniClearTitle")}</div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">{t("landingMiniClearBody")}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border border-border bg-bg-surface/40">
                  <MessageCircleQuestion className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <div className="text-xs font-mono text-text-primary">{t("landingMiniHelpTitle")}</div>
                    <div className="text-[11px] font-mono text-text-muted mt-1">{t("landingMiniHelpBody")}</div>
                  </div>
                </div>
              </div>
            </div>

            <Card className="p-6">
              <div className="space-y-4">
                <div className="text-sm font-mono text-text-secondary">{t("landingQuickStart")}</div>

                <div className="space-y-3">
                  <div className="p-3 border border-border bg-bg-code">
                    <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                      <Rocket className="w-4 h-4 text-primary" />
                      {t("landingStepsTitle")}
                    </div>
                    <ol className="mt-2 space-y-2 text-xs font-mono text-text-primary">
                      <li className="flex gap-2">
                        <span className="text-text-muted">1)</span>
                        <span>{t("landingStep1")}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-text-muted">2)</span>
                        <span>{t("landingStep2")}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-text-muted">3)</span>
                        <span>{t("landingStep3")}</span>
                      </li>
                    </ol>
                  </div>

                  <button className="w-full text-left p-3 border border-border hover:bg-bg-hover transition-fast" onClick={() => navigate("/?auth=register")}
                >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        <span className="text-sm font-mono text-text-primary">{t("landingQuickPersonal")}</span>
                      </div>
                      <span className="text-xs font-mono text-text-secondary">{tr("для новачків", "beginner-friendly")}</span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-text-muted">{t("landingQuickPersonalHint")}</div>
                  </button>

                  <button className="w-full text-left p-3 border border-border hover:bg-bg-hover transition-fast" onClick={() => navigate("/?auth=login")}
                >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-primary" />
                        <span className="text-sm font-mono text-text-primary">{t("landingQuickEdu")}</span>
                      </div>
                      <span className="text-xs font-mono text-text-secondary">{tr("для класів", "for classes")}</span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-text-muted">{t("landingQuickEduHint")}</div>
                  </button>

                  <button className="w-full text-left p-3 border border-border hover:bg-bg-hover transition-fast" onClick={() => navigate("/?auth=login&next=%2Flibrary")}
                >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Library className="w-4 h-4 text-primary" />
                        <span className="text-sm font-mono text-text-primary">{t("landingQuickLibrary")}</span>
                      </div>
                      <span className="text-xs font-mono text-text-secondary">{t("landingRequiresAccount")}</span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-text-muted">{t("landingQuickLibraryHint")}</div>
                  </button>
                </div>

                <div className="pt-2">
                  <Button className="w-full" onClick={() => navigate("/docs")}> 
                    <BookOpen className="w-4 h-4" /> {t("landingCtaDocs")}
                  </Button>
                </div>

                <div className="text-[11px] font-mono text-text-muted">
                  <ShieldCheck className="inline w-3 h-3 mr-1 align-[-2px]" />
                  {t("landingPrivacy")}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <div className="text-sm font-mono text-text-primary">{t("landingCardPersonalTitle")}</div>
              </div>
              <div className="mt-2 text-xs font-mono text-text-secondary leading-relaxed">{t("landingCardPersonalBody")}</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                <div className="text-sm font-mono text-text-primary">{t("landingCardEduTitle")}</div>
              </div>
              <div className="mt-2 text-xs font-mono text-text-secondary leading-relaxed">{t("landingCardEduBody")}</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Library className="w-4 h-4 text-primary" />
                <div className="text-sm font-mono text-text-primary">{t("landingCardLibraryTitle")}</div>
              </div>
              <div className="mt-2 text-xs font-mono text-text-secondary leading-relaxed">{t("landingCardLibraryBody")}</div>
            </Card>
          </div>

          <div className="mt-10 flex items-center justify-between text-xs font-mono text-text-muted border-t border-border pt-6">
            <div>© {new Date().getFullYear()} StudyCod</div>
            <div className="flex items-center gap-3">
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/privacy")}>{t("footerPrivacyPolicy")}</button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/terms")}>{t("footerTermsOfUse")}</button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/cookies")}>{t("footerCookiePolicy")}</button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/support")}>{t("landingSupport")}</button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/docs")}>{t("help")}</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
