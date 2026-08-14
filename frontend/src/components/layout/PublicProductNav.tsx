import React from "react";
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
  const [theme, setTheme] = React.useState<"dark" | "light">(() => getCurrentTheme());
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const authenticated = Boolean(getCachedMeUser());
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const supportPath = import.meta.env.DEV ? "/support?preview=true" : "/support";
  const blogPath = import.meta.env.DEV ? "/blog?preview=true" : "/blog";

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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return <header className={(homeMode ? "fixed" : "sticky") + " inset-x-0 top-0 z-50 h-[74px] border-b border-[#122017]/[.07] bg-[#f7f8f5]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d120f]/85 max-md:h-16"}>
    <div className="mx-auto flex h-full w-[min(1240px,calc(100%_-_48px))] items-center justify-between gap-7 max-md:w-[calc(100%_-_28px)] max-md:gap-2">
      <button type="button" onClick={() => homeMode ? window.scrollTo({ top: 0, behavior: "smooth" }) : go("/")} className="bg-transparent text-left max-md:[&>span>span:last-child]:hidden" aria-label="StudyCod — learn by building">
        <BrandLockup />
      </button>

      <nav className="flex items-center gap-7 max-[980px]:hidden" aria-label={tr("Головна навігація", "Main navigation")}>
        {homeMode ? homeItems.map(item => <button type="button" key={item.id} onClick={() => goHomeItem(item.id)} className="relative py-2 text-[13px] font-semibold text-[#667169] transition after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-[#00b963] after:transition-transform hover:text-[#111814] hover:after:scale-x-100 dark:text-[#9da9a1] dark:hover:text-white">{item.label}</button>) : routeItems.map(item => <button type="button" key={item.id} onClick={() => go(item.path)} className={"relative py-2 text-[13px] font-semibold transition after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#00b963] " + (active === item.id ? "text-[#111814] after:scale-x-100 dark:text-white" : "text-[#667169] after:scale-x-0 hover:text-[#111814] hover:after:scale-x-100 dark:text-[#9da9a1] dark:hover:text-white")}>{item.label}</button>)}
      </nav>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="flex h-10 items-center gap-1.5 rounded-xl border border-[#122017]/10 bg-white px-3 text-[11px] font-bold text-[#667169] transition hover:border-[#00b963]/30 hover:text-[#111814] dark:border-white/10 dark:bg-[#182019] dark:text-[#a7b2aa] dark:hover:text-white max-md:w-9 max-md:justify-center max-md:px-0"><Languages className="size-3.5" /><span className="max-md:hidden">{i18n.language === "uk" ? "EN" : "UA"}</span></button>
        <button type="button" onClick={switchTheme} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 hover:text-[#111814] dark:border-white/10 dark:bg-[#182019] dark:text-[#a7b2aa] dark:hover:text-white" title={theme === "dark" ? tr("Світла тема", "Light theme") : tr("Темна тема", "Dark theme")} aria-label={theme === "dark" ? tr("Увімкнути світлу тему", "Switch to light theme") : tr("Увімкнути темну тему", "Switch to dark theme")}>{theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}</button>
        {authenticated ? <button type="button" onClick={() => go("/")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#00ff88] px-4 text-[12px] font-bold text-[#07140d] shadow-[0_10px_26px_rgba(0,185,99,.14)] transition hover:-translate-y-0.5 hover:bg-[#2bff9b] max-[520px]:hidden">{tr("До кабінету", "Open workspace")}<ArrowRight className="size-4" /></button> : <><button type="button" onClick={() => go("/?auth=login")} className="px-2 text-[13px] font-semibold text-[#667169] transition hover:text-[#111814] dark:text-[#a7b2aa] dark:hover:text-white max-md:hidden">{tr("Увійти", "Log in")}</button><button type="button" onClick={() => go("/?auth=register")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#00ff88] px-4 text-[12px] font-bold text-[#07140d] shadow-[0_10px_26px_rgba(0,185,99,.14)] transition hover:-translate-y-0.5 hover:bg-[#2bff9b] max-[520px]:hidden">{tr("Почати", "Get started")}<ArrowRight className="size-4" /></button></>}
        <button type="button" onClick={() => setMobileOpen(value => !value)} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] dark:border-white/10 dark:bg-[#182019] dark:text-[#a7b2aa] min-[981px]:hidden" aria-label={mobileOpen ? tr("Закрити меню", "Close menu") : tr("Відкрити меню", "Open menu")} aria-expanded={mobileOpen} aria-controls="public-mobile-navigation">{mobileOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}</button>
      </div>
    </div>

    {mobileOpen && <div id="public-mobile-navigation" className="border-t border-[#122017]/10 bg-[#f7f8f5]/95 px-4 py-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0d120f]/95 min-[981px]:hidden">
      <div className="mx-auto grid max-w-md gap-1">
        {(homeMode ? homeItems : routeItems).map(item => <button type="button" key={item.id} onClick={() => homeMode ? goHomeItem(item.id) : go("path" in item && typeof item.path === "string" ? item.path : "/")} className={"rounded-xl px-4 py-3 text-left text-[13px] font-semibold " + (!homeMode && active === item.id ? "bg-[#00ff88]/10 text-[#00884a] dark:text-[#62ecaa]" : "text-[#667169] dark:text-[#a7b2aa]")}>{item.label}</button>)}
        {authenticated ? <button type="button" onClick={() => go("/")} className="mt-2 h-11 rounded-xl bg-[#00ff88] text-[12px] font-bold text-[#07140d]">{tr("До кабінету", "Open workspace")}</button> : <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#122017]/10 pt-3 dark:border-white/10"><button type="button" onClick={() => go("/?auth=login")} className="h-11 rounded-xl border border-[#122017]/10 bg-white text-[12px] font-bold dark:border-white/10 dark:bg-[#182019]">{tr("Увійти", "Log in")}</button><button type="button" onClick={() => go("/?auth=register")} className="h-11 rounded-xl bg-[#00ff88] text-[12px] font-bold text-[#07140d]">{tr("Почати", "Get started")}</button></div>}
      </div>
    </div>}
  </header>;
};

export default PublicProductNav;
