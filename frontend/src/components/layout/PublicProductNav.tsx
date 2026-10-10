import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Languages, Menu, Moon, Sun, X } from "lucide-react";
import { BrandLockup } from "../BrandLockup";
import { applyTheme, getCurrentTheme } from "../../theme";
import { getCachedMeUser } from "../../lib/api/profile";

type ActivePage = "home" | "pricing" | "docs" | "support" | "blog" | "none";

type Props = {
  active?: ActivePage;
  homeMode?: boolean;
};

export const PublicProductNav: React.FC<Props> = ({ active = "none", homeMode = false }) => {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [theme, setTheme] = React.useState<"dark" | "light">(() => getCurrentTheme());
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const authenticated = Boolean(getCachedMeUser());
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const supportPath = import.meta.env.DEV ? "/support?preview=true" : "/support";
  const blogPath = import.meta.env.DEV ? "/blog?preview=true" : "/blog";
  React.useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      mobileMenuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);
  const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" as const : "smooth" as const;

  const routeItems: Array<{ id: ActivePage; label: string; path: string }> = [
    { id: "home", label: tr("Головна", "Home"), path: "/" },
    { id: "pricing", label: tr("Тарифи", "Pricing"), path: "/pricing" },
    { id: "docs", label: tr("Документація", "Documentation"), path: "/docs" },
    { id: "blog", label: tr("Блог", "Blog"), path: blogPath },
    { id: "support", label: tr("Підтримка", "Support"), path: supportPath },
  ];

  const homeItems = [
    { id: "platform", label: tr("Платформа", "Platform") },
    { id: "practice", label: tr("Практика", "Practice") },
    { id: "roles", label: tr("Для кого", "For whom") },
    { id: "pricing", label: tr("Тарифи", "Pricing") },
  ];

  const go = (path: string) => {
    setMobileOpen(false);
    window.location.assign(path);
  };
  const goHomeItem = (id: string) => {
    setMobileOpen(false);
    if (id === "pricing") {
      window.location.assign("/pricing");
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior() });
  };
  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return <><a className="skip-link" href="#main-content">{tr("Перейти до основного вмісту", "Skip to main content")}</a><header className={(homeMode ? "fixed" : "sticky") + " inset-x-0 top-0 z-50 h-16 border-b border-border/60 bg-bg-base/92 backdrop-blur-xl max-md:h-14"}>
    <div className="mx-auto flex h-full w-[min(1240px,calc(100%_-_48px))] items-center justify-between gap-7 max-md:w-[calc(100%_-_28px)] max-md:gap-2">
      <button type="button" onClick={() => homeMode ? window.scrollTo({ top: 0, behavior: scrollBehavior() }) : go("/")} className="bg-transparent text-left max-md:[&>span>span:last-child]:hidden" aria-label={tr("StudyCod — навчання через практику", "StudyCod — learn by building")}>
        <BrandLockup />
      </button>

      <nav className="flex items-center gap-7 max-[980px]:hidden" aria-label={tr("Головна навігація", "Main navigation")}>
        {homeMode ? homeItems.map(item => <button type="button" key={item.id} onClick={() => goHomeItem(item.id)} className="relative py-2 text-[13px] font-semibold text-text-muted transition after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:text-text-primary hover:after:scale-x-100">{item.label}</button>) : routeItems.map(item => <a key={item.id} href={item.path} aria-current={active === item.id ? "page" : undefined} className={"relative py-2 text-[13px] font-semibold transition after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary " + (active === item.id ? "text-text-primary after:scale-x-100" : "text-text-muted after:scale-x-0 hover:text-text-primary hover:after:scale-x-100")}>{item.label}</a>)}
      </nav>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} aria-label={i18n.language === "uk" ? tr("Перемкнути на англійську", "Switch to English") : tr("Перемкнути на українську", "Switch to Ukrainian")} className="flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-bg-surface px-3 text-[11px] font-bold text-text-muted transition hover:border-primary/30 hover:text-text-primary max-md:size-11 max-md:justify-center max-md:px-0"><Languages className="size-3.5" aria-hidden="true" /><span className="max-md:hidden">{i18n.language === "uk" ? "EN" : "UA"}</span></button>
        <button type="button" onClick={switchTheme} className="grid size-11 place-items-center rounded-xl border border-border/70 bg-bg-surface text-text-muted transition hover:border-primary/30 hover:text-text-primary" title={theme === "dark" ? tr("Світла тема", "Light theme") : tr("Темна тема", "Dark theme")} aria-label={theme === "dark" ? tr("Увімкнути світлу тему", "Switch to light theme") : tr("Увімкнути темну тему", "Switch to dark theme")}>{theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}</button>
        {authenticated ? <button type="button" onClick={() => go("/")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-bold text-primary-foreground shadow-sm transition-fast hover:-translate-y-0.5 hover:bg-primary-hover max-[520px]:hidden">{tr("До кабінету", "Open workspace")}<ArrowRight className="size-4" /></button> : <><button type="button" onClick={() => go("/?auth=login")} className="px-2 text-[13px] font-semibold text-text-muted transition hover:text-text-primary max-md:hidden">{tr("Увійти", "Log in")}</button><button type="button" onClick={() => go("/?auth=register")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-bold text-primary-foreground shadow-sm transition-fast hover:-translate-y-0.5 hover:bg-primary-hover max-[520px]:hidden">{tr("Почати", "Get started")}<ArrowRight className="size-4" /></button></>}
        <button ref={mobileMenuButtonRef} type="button" onClick={() => setMobileOpen(value => !value)} className="grid size-11 place-items-center rounded-xl border border-border/70 bg-bg-surface text-text-muted min-[981px]:hidden" aria-label={mobileOpen ? tr("Закрити меню", "Close menu") : tr("Відкрити меню", "Open menu")} aria-expanded={mobileOpen} aria-controls="public-mobile-navigation">{mobileOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}</button>
      </div>
    </div>

    <AnimatePresence initial={false}>
    {mobileOpen && <motion.nav id="public-mobile-navigation" aria-label={tr("Мобільна навігація", "Mobile navigation")} initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] } }} transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="border-t border-border/70 bg-bg-base px-4 py-3 shadow-xl min-[981px]:hidden">
      <div className="mx-auto grid max-w-md gap-1">
        {(homeMode ? homeItems : routeItems).map(item => homeMode ? <button type="button" key={item.id} onClick={() => goHomeItem(item.id)} className="rounded-xl px-4 py-3 text-left text-[13px] font-semibold text-text-muted">{item.label}</button> : <a key={item.id} href={(item as unknown as { path: string }).path} onClick={() => setMobileOpen(false)} aria-current={active === item.id ? "page" : undefined} className={"rounded-xl px-4 py-3 text-left text-[13px] font-semibold " + (active === item.id ? "bg-primary/10 text-primary-strong dark:text-primary-soft" : "text-text-muted")}>{item.label}</a>)}
        {authenticated ? <button type="button" onClick={() => go("/")} className="mt-2 h-11 rounded-xl bg-primary text-[12px] font-bold text-primary-foreground">{tr("До кабінету", "Open workspace")}</button> : <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/10 pt-3 dark:border-white/10"><button type="button" onClick={() => go("/?auth=login")} className="h-11 rounded-xl border border-border/10 bg-white text-[12px] font-bold dark:border-white/10 dark:bg-bg-surface">{tr("Увійти", "Log in")}</button><button type="button" onClick={() => go("/?auth=register")} className="h-11 rounded-xl bg-primary text-[12px] font-bold text-primary-foreground">{tr("Почати", "Get started")}</button></div>}
      </div>
    </motion.nav>}
    </AnimatePresence>
  </header></>;
};

export default PublicProductNav;
