import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Logo } from "../../components/Logo";
import { Button } from "../../components/ui/Button";
import { UIModeSwitch } from "../../components/ui/UIModeSwitch";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { IntroSplash } from "../../components/IntroSplash";
import { GraduationCap, User, Library, BookOpen, ShieldCheck, Timer, CheckCircle2, MessageCircleQuestion, ArrowRight, Terminal, Code2, Trophy } from "lucide-react";
import { applyTheme, getCurrentTheme } from "../../theme";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

export const PublicLandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";

  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const topMenuButtonClass =
    "inline-flex h-8 items-center justify-center rounded-md border border-border/80 bg-bg-code/70 px-3 text-[11px] font-mono uppercase tracking-[0.08em] text-text-secondary transition-fast hover:-translate-y-[1px] hover:border-primary/50 hover:bg-bg-hover/80 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/60";
  const [theme, setTheme] = React.useState<"dark" | "light">(() => getCurrentTheme());

  const features = [
    {
      Icon: Timer,
      title: t("landingMiniFastTitle"),
      body: t("landingMiniFastBody"),
    },
    {
      Icon: CheckCircle2,
      title: t("landingMiniClearTitle"),
      body: t("landingMiniClearBody"),
    },
    {
      Icon: MessageCircleQuestion,
      title: t("landingMiniHelpTitle"),
      body: t("landingMiniHelpBody"),
    },
  ];

  const cards = [
    { Icon: User, title: t("landingCardPersonalTitle"), body: t("landingCardPersonalBody") },
    { Icon: GraduationCap, title: t("landingCardEduTitle"), body: t("landingCardEduBody") },
    { Icon: Library, title: t("landingCardLibraryTitle"), body: t("landingCardLibraryBody") },
  ];

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-bg-code/35 p-1.5">
      <button type="button" onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className={topMenuButtonClass} title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}>
        {i18n.language === "uk" ? "EN" : "UA"}
      </button>
      <button type="button" onClick={() => { const next = theme === "dark" ? "light" : "dark"; applyTheme(next); setTheme(next); }} className={topMenuButtonClass} title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <button type="button" className={topMenuButtonClass} onClick={() => navigate("/docs")}>{t("help")}</button>
    </div>
  );

  if (isAurora) {
    // Laconic Aurora landing — single column, hairline rows, prose. No terminal
    // card, no heavy grids/shadows; same value prop, calmer composition.
    const valueRows = [...features, ...cards];
    return (
      <div className="min-h-[100dvh] bg-bg-base text-text-primary">
        <IntroSplash />
        <header className="h-16 flex items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={22} className="text-primary" />
            <span className="font-mono font-semibold text-sm tracking-tight text-text-primary">StudyCod</span>
          </div>
          {headerActions}
        </header>

        <main className="px-5 sm:px-6 pb-16">
          <div className="mx-auto w-full max-w-[680px]">
            <div className="pt-12 md:pt-20">
              <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">StudyCod</span>
              <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-[1.1] text-text-primary">{t("landingTitle")}</h1>
              <p className="mt-3 text-[15px] text-text-secondary leading-relaxed max-w-xl">{t("landingSubtitle")}</p>

              <div className="mt-7 flex flex-wrap gap-2.5">
                <Button onClick={() => navigate("/?auth=register")}>{t("landingCtaRegister")}</Button>
                <Button variant="ghost" onClick={() => navigate("/?auth=login")}>{t("landingCtaLogin")}</Button>
                <Button variant="ghost" onClick={() => navigate("/?auth=login&next=%2Flibrary")}>{t("landingCtaLibrary")}</Button>
              </div>
              <p className="mt-3 text-xs font-mono text-text-muted">{t("landingNote")}</p>

              <div className="mt-6 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">
                  {t("chooseUiVersion", { defaultValue: i18n.language?.toLowerCase().startsWith("en") ? "Choose a UI version" : "Оберіть версію інтерфейсу" })}
                </div>
                <UIModeSwitch label={false} />
              </div>
            </div>

            {/* What you get — one uniform hairline list (features + modes merged). */}
            <div className="mt-14">
              {valueRows.map(({ Icon, title, body }) => (
                <div key={title} className="flex items-start gap-3.5 py-4 border-t border-border first:border-t-0">
                  <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[15px] text-text-primary">{title}</div>
                    <div className="mt-0.5 text-[13px] text-text-muted leading-relaxed">{body}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick start as a plain ordered list. */}
            <div className="mt-12">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">{t("landingStepsTitle")}</div>
              <ol className="mt-3 space-y-2.5 text-[14px] text-text-secondary">
                {[t("landingStep1"), t("landingStep2"), t("landingStep3")].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-text-muted font-mono text-xs tabular-nums pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Stats as one quiet prose line. */}
            <p className="mt-10 text-[13px] font-mono text-text-muted">
              200+ {tr("задач у бібліотеці", "library tasks")} · 50+ {tr("контестів", "contests")} · 10k+ {tr("подань оцінено", "submissions judged")}
            </p>

            <div className="mt-14 flex flex-wrap items-center justify-between text-xs font-mono text-text-muted border-t border-border pt-6 gap-4">
              <div>© {new Date().getFullYear()} StudyCod</div>
              <div className="flex flex-wrap items-center gap-3">
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
  }

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary">
      {/* One-time cinematic brand intro (first visit only). */}
      <IntroSplash />

      {/* Header */}
      <header className="h-16 border-b border-border bg-bg-surface/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Logo size={28} className="text-primary" />
          <span className="text-lg font-mono text-text-primary tracking-tight">StudyCod</span>
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

          <button type="button" className={topMenuButtonClass} onClick={() => navigate("/docs")}>
            {t("help")}
          </button>
        </div>
      </header>

      <main className="px-6 py-12">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Hero */}
          <motion.div
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOutQuint }}
            className="grid grid-cols-1 lg:grid-cols-[1.2fr,0.8fr] gap-10 items-start"
          >
            {/* Left column: value prop */}
            <div className="space-y-7">
              <div className="space-y-4">
                <span className="font-mono text-xs text-primary/70">// studycod</span>

                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-text-primary leading-tight">
                  {t("landingTitle")}
                </h1>

                <p className="text-sm md:text-base text-text-secondary max-w-xl leading-relaxed">
                  {t("landingSubtitle")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => navigate("/?auth=register")}>{t("landingCtaRegister")}</Button>
                <Button variant="secondary" onClick={() => navigate("/?auth=login")}>
                  {t("landingCtaLogin")}
                </Button>
                <Button variant="ghost" onClick={() => navigate("/?auth=login&next=%2Flibrary")}>
                  {t("landingCtaLibrary")}
                </Button>
              </div>

              <div className="text-xs font-mono text-text-muted">{t("landingNote")}</div>

              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">
                  {t("chooseUiVersion", { defaultValue: i18n.language?.toLowerCase().startsWith("en") ? "Choose a UI version" : "Оберіть версію інтерфейсу" })}
                </div>
                <UIModeSwitch label={false} />
              </div>

              {/* Mini feature pills */}
              <motion.div
                variants={prefersReducedMotion ? undefined : staggerContainer}
                initial={prefersReducedMotion ? undefined : "initial"}
                animate={prefersReducedMotion ? undefined : "animate"}
                className="grid grid-cols-1 md:grid-cols-3 gap-3"
              >
                {features.map(({ Icon, title, body }) => (
                  <motion.div
                    key={title}
                    variants={prefersReducedMotion ? undefined : fadeUpItem}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-surface hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] transition-fast"
                  >
                    <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-text-primary">{title}</div>
                      <div className="text-[11px] text-text-muted mt-1 leading-relaxed">{body}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Right column: terminal-style quick-start card */}
            <div className="rounded-xl border border-border bg-bg-surface shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)] overflow-hidden">
              {/* Terminal dots bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-bg-code/60">
                <span className="w-3 h-3 rounded-full bg-accent-error/60" />
                <span className="w-3 h-3 rounded-full bg-accent-warn/60" />
                <span className="w-3 h-3 rounded-full bg-accent-success/60" />
                <span className="ml-3 text-xs font-mono text-text-muted">studycod — quick-start</span>
              </div>

              <div className="p-5 space-y-4">
                <div className="text-sm font-mono text-text-secondary">{t("landingQuickStart")}</div>

                <div className="space-y-2">
                  {/* Steps block */}
                  <div className="rounded-lg border border-border bg-bg-code p-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-text-secondary mb-2">
                      <Terminal className="w-3.5 h-3.5 text-primary" />
                      {t("landingStepsTitle")}
                    </div>
                    <ol className="space-y-1.5 text-xs font-mono text-text-primary">
                      <li className="flex gap-2">
                        <span className="text-primary/60">01</span>
                        <span>{t("landingStep1")}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary/60">02</span>
                        <span>{t("landingStep2")}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary/60">03</span>
                        <span>{t("landingStep3")}</span>
                      </li>
                    </ol>
                  </div>

                  {[
                    {
                      Icon: User,
                      label: t("landingQuickPersonal"),
                      hint: t("landingQuickPersonalHint"),
                      tag: tr("для новачків", "beginner-friendly"),
                      onClick: () => navigate("/?auth=register"),
                    },
                    {
                      Icon: GraduationCap,
                      label: t("landingQuickEdu"),
                      hint: t("landingQuickEduHint"),
                      tag: tr("для класів", "for classes"),
                      onClick: () => navigate("/?auth=login"),
                    },
                    {
                      Icon: Library,
                      label: t("landingQuickLibrary"),
                      hint: t("landingQuickLibraryHint"),
                      tag: t("landingRequiresAccount"),
                      onClick: () => navigate("/?auth=login&next=%2Flibrary"),
                    },
                  ].map(({ Icon, label, hint, tag, onClick }) => (
                    <button
                      key={label}
                      className="w-full text-left rounded-xl border border-border bg-bg-base/50 hover:border-primary/40 hover:bg-bg-hover p-3 transition-fast group"
                      onClick={onClick}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-primary" />
                          <span className="text-sm font-mono text-text-primary">{label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-text-secondary">{tag}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-fast" />
                        </div>
                      </div>
                      <div className="mt-1 text-xs font-mono text-text-muted">{hint}</div>
                    </button>
                  ))}
                </div>

                <div>
                  <Button className="w-full" onClick={() => navigate("/docs")}>
                    <BookOpen className="w-4 h-4" />
                    {t("landingCtaDocs")}
                  </Button>
                </div>

                <div className="text-[11px] font-mono text-text-muted">
                  <ShieldCheck className="inline w-3 h-3 mr-1 align-[-2px]" />
                  {t("landingPrivacy")}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Hairline */}
          <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

          {/* Feature cards */}
          <div>
            <div className="mb-6">
              <span className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
                {tr("// можливості", "// features")}
              </span>
            </div>
            <motion.div
              variants={prefersReducedMotion ? undefined : staggerContainer}
              initial={prefersReducedMotion ? undefined : "initial"}
              animate={prefersReducedMotion ? undefined : "animate"}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {cards.map(({ Icon, title, body }) => (
                <motion.div
                  key={title}
                  variants={prefersReducedMotion ? undefined : fadeUpItem}
                  className="rounded-xl border border-border bg-bg-surface p-5 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] transition-fast"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-sm font-semibold text-text-primary">{title}</div>
                  </div>
                  <div className="text-xs text-text-secondary leading-relaxed">{body}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Stats strip */}
          <div className="rounded-xl border border-border bg-bg-surface p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              {[
                { Icon: Code2, label: tr("Задач у бібліотеці", "Library tasks"), value: "200+" },
                { Icon: Trophy, label: tr("Контестів проведено", "Contests held"), value: "50+" },
                { Icon: CheckCircle2, label: tr("Подань оцінено", "Submissions judged"), value: "10k+" },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <Icon className="w-5 h-5 text-primary/70" />
                  <div className="text-2xl font-mono font-semibold text-text-primary">{value}</div>
                  <div className="text-xs text-text-muted font-mono">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between text-xs font-mono text-text-muted border-t border-border pt-6 gap-4">
            <div>© {new Date().getFullYear()} StudyCod</div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/privacy")}>
                {t("footerPrivacyPolicy")}
              </button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/terms")}>
                {t("footerTermsOfUse")}
              </button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/cookies")}>
                {t("footerCookiePolicy")}
              </button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/support")}>
                {t("landingSupport")}
              </button>
              <button className="hover:text-text-primary transition-fast" onClick={() => navigate("/docs")}>
                {t("help")}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
