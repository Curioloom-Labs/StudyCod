import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronDown, CircleUserRound, Code2, Compass, Home, LogOut, Moon, PlaySquare, ShieldCheck, Sun, Trophy } from "lucide-react";
import { Logo } from "../Logo";
import { PlatformFooter } from "./PlatformFooter";
import type { User } from "../../types";
import type { AppTheme } from "../../theme";

type Page = "home" | "tasks" | "grades" | "plan" | "profile" | "teacher" | "student" | "admin";

export const PremiumWorkspaceShell: React.FC<{
  user: User;
  page: Page;
  theme: AppTheme;
  onNavigate: (page: Page) => void;
  onLibrary: () => void;
  onPlayground: () => void;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}> = ({ user, page, theme, onNavigate, onLibrary, onPlayground, onToggleTheme, onToggleLanguage, onLogout, children }) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const nav: Array<{ id: Page; label: string; Icon: React.ElementType<{ className?: string }> }> = [
    { id: "home" as const, label: uk ? "Огляд" : "Overview", Icon: Home },
    { id: "tasks" as const, label: uk ? "Практика" : "Practice", Icon: Code2 },
    { id: "grades" as const, label: uk ? "Прогрес" : "Progress", Icon: Trophy },
    { id: "plan" as const, label: uk ? "План" : "Plan", Icon: Compass },
    ...(user.role === "SYSTEM_ADMIN" ? [{ id: "admin" as const, label: uk ? "Адміністрування" : "Admin", Icon: ShieldCheck }] : []),
  ];
  const active = (id: Page) => page === id;
  return <div className="min-h-[100dvh] bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
    <header className="sticky top-0 z-50 border-b border-[#152219]/10 bg-[#f7f8f5]/82 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b120e]/82">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <button type="button" onClick={() => onNavigate("home")} className="flex shrink-0 items-center gap-2.5 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#153321]"><Logo size={19} /></span><span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em]">StudyCod</span></button>
        <nav className="hidden items-center gap-1 rounded-xl bg-[#edf1ed] p-1 dark:bg-white/[.055] lg:flex">{nav.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => onNavigate(id)} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${active(id) ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}><Icon className="h-4 w-4" />{label}</button>)}<button type="button" onClick={onLibrary} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-[#657368] transition hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"><BookOpen className="h-4 w-4" />{uk ? "Бібліотека" : "Library"}</button><button type="button" onClick={onPlayground} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-[#657368] transition hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"><PlaySquare className="h-4 w-4" />{uk ? "Пісочниця" : "Playground"}</button></nav>
        <div className="flex items-center gap-1.5 sm:gap-2"><button type="button" onClick={onToggleTheme} className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07]">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}<span className="hidden sm:inline">{theme === "dark" ? (uk ? "Світла" : "Light") : (uk ? "Темна" : "Dark")}</span></button><button type="button" onClick={onToggleLanguage} className="hidden h-9 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07] sm:block">{uk ? "EN" : "UA"}</button><div className="group relative"><button type="button" onClick={() => onNavigate("profile")} className={`flex h-10 items-center gap-2 rounded-xl px-1.5 pr-2.5 transition ${active("profile") ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]" : "hover:bg-[#e9eeea] dark:hover:bg-white/[.07]"}`}><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-[#18261d] text-xs font-bold text-[#70edaf] dark:bg-[#edf3ef] dark:text-[#0b120e]">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : user.username.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-24 truncate text-sm font-semibold sm:block">{user.firstName || user.username}</span><ChevronDown className="hidden h-3.5 w-3.5 sm:block" /></button><div className="invisible absolute right-0 top-[calc(100%+8px)] w-44 translate-y-1 rounded-xl border border-[#152219]/10 bg-white p-1 opacity-0 shadow-[0_18px_45px_-24px_rgba(14,34,20,.35)] transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#172018]"><button type="button" onClick={() => onNavigate("profile")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-[#f1f4f1] dark:hover:bg-white/[.07]"><CircleUserRound className="h-4 w-4" />{uk ? "Профіль" : "Profile"}</button><button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d84d71] hover:bg-[#fff1f4] dark:text-[#ff94b7] dark:hover:bg-[#ff6b9d]/10"><LogOut className="h-4 w-4" />{uk ? "Вийти" : "Sign out"}</button></div></div></div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-[#152219]/8 px-4 py-2 lg:hidden dark:border-white/8">{nav.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => onNavigate(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active(id) ? "bg-[#142017] text-white dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#69786d] dark:text-[#a4b2a7]"}`}><Icon className="h-4 w-4" />{label}</button>)}<button type="button" onClick={onLibrary} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#69786d] dark:text-[#a4b2a7]"><BookOpen className="h-4 w-4" />{uk ? "Бібліотека" : "Library"}</button><button type="button" onClick={onPlayground} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#69786d] dark:text-[#a4b2a7]"><PlaySquare className="h-4 w-4" />{uk ? "Пісочниця" : "Playground"}</button></nav>
    </header>
    <main className="flex-1">{children}</main>
    <PlatformFooter />
  </div>;
};
