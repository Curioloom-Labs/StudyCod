import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, Code2, Compass, GraduationCap, HelpCircle, LogOut, Menu, Moon, PlaySquare, Sun, Trophy, UserRound, X } from "lucide-react";
import type { User } from "../../types";
import { getMe } from "../../lib/api/profile";
import { applyTheme, getCurrentTheme, type AppTheme } from "../../theme";
import { Logo } from "../Logo";
import { BrandedPageLoader } from "../ui/BrandedPageLoader";
import { PlatformFooter } from "./PlatformFooter";

type Props = {
  current: "home" | "tasks" | "grades" | "profile" | "learn" | "library" | "playground" | "blog";
  children: React.ReactNode;
};

let cachedSession: { token: string; user: User } | null = null;

const tokenFromStorage = () => {
  try { return localStorage.getItem("token"); } catch { return null; }
};

/**
 * Shared chrome for product utilities. It intentionally has no UI-mode branch:
 * utility pages must look like the same current StudyCod product as the core app.
 */
export const StandaloneShell: React.FC<Props> = ({ current, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const ukrainian = !i18n.language.toLowerCase().startsWith("en");
  const token = tokenFromStorage();
  const [user, setUser] = React.useState<User | null>(() => token && cachedSession?.token === token ? cachedSession.user : null);
  const [loading, setLoading] = React.useState(Boolean(token) && !user);
  const [theme, setTheme] = React.useState<AppTheme>(getCurrentTheme);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const devPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";
  const shellUser: User | null = user ?? (devPreview ? {
    id: -1,
    username: ukrainian ? "\u0414\u0435\u043c\u043e" : "Demo",
    firstName: ukrainian ? "\u0414\u0435\u043c\u043e" : "Demo",
    course: "PYTHON",
    difus: 0,
    avatarUrl: null,
    userMode: "PERSONAL"
  } : null);

  React.useEffect(() => {
    if (!token || user) return;
    let active = true;
    getMe()
      .then((nextUser) => {
        cachedSession = { token, user: nextUser };
        if (active) setUser(nextUser);
      })
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token, user]);

  const toggleTheme = () => setTheme((previous) => {
    const next = previous === "dark" ? "light" : "dark";
    applyTheme(next);
    return next;
  });

  if (!token && !devPreview) return <>{children}</>;
  if (loading) return <BrandedPageLoader />;
  if (!shellUser) return <>{children}</>;

  const education = shellUser.userMode === "EDUCATIONAL";
  const nav = education
    ? [
        { key: "learn", label: ukrainian ? "Навчання" : "Learning", icon: GraduationCap, path: shellUser.studentId ? "/edu/lessons" : "/edu" },
        { key: "blog", label: ukrainian ? "Спільнота" : "Community", icon: BookOpen, path: "/blog" },
        { key: "profile", label: ukrainian ? "Профіль" : "Profile", icon: UserRound, path: "/?app=profile" }
      ]
    : [
        { key: "home", label: ukrainian ? "Огляд" : "Overview", icon: Compass, path: "/" },
        { key: "tasks", label: ukrainian ? "Практика" : "Practice", icon: Code2, path: "/?app=tasks" },
        { key: "grades", label: ukrainian ? "Прогрес" : "Progress", icon: Trophy, path: "/?app=grades" },
        { key: "learn", label: ukrainian ? "Маршрут" : "Plan", icon: GraduationCap, path: "/learn" },
        { key: "library", label: ukrainian ? "Бібліотека" : "Library", icon: BookOpen, path: "/library" },
        { key: "playground", label: ukrainian ? "Пісочниця" : "Playground", icon: PlaySquare, path: "/playground" },
        { key: "profile", label: ukrainian ? "Профіль" : "Profile", icon: UserRound, path: "/?app=profile" }
      ];

  const navigateTo = (path: string) => {
    setMobileOpen(false);
    const destination = devPreview
      ? `${path}${path.includes("?") ? "&" : "?"}preview=true`
      : path;
    navigate(destination);
  };

  return <div className="min-h-[100dvh] bg-[#f5f7f4] text-[#17231b] transition-colors dark:bg-[#09100c] dark:text-[#edf4ef]">
    <header className="sticky top-0 z-50 border-b border-[#16281b]/10 bg-[#f5f7f4]/86 backdrop-blur-xl dark:border-white/[.08] dark:bg-[#09100c]/84">
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-9">
        <button type="button" onClick={() => navigateTo(education ? (shellUser.studentId ? "/edu/lessons" : "/edu") : "/")} className="flex shrink-0 items-center gap-2.5 text-left">
          <span className="grid size-10 place-items-center rounded-[14px] bg-[#183524] shadow-[0_8px_20px_rgba(14,41,26,.12)]"><Logo size={20} /></span>
          <span className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-[-.055em]">StudyCod</span>
        </button>
        <nav aria-label={ukrainian ? "Основна навігація" : "Primary navigation"} className="hidden items-center gap-1 rounded-2xl border border-[#152219]/8 bg-white/70 p-1.5 shadow-[0_10px_28px_rgba(23,45,29,.04)] dark:border-white/[.08] dark:bg-white/[.035] lg:flex">
          {nav.map(({ key, label, icon: Icon, path }) => <button key={key} type="button" onClick={() => navigateTo(path)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${current === key ? "bg-[#18291e] text-white shadow-sm dark:bg-[#eaf2eb] dark:text-[#0c140f]" : "text-[#637267] hover:bg-[#edf2ed] hover:text-[#152219] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}><Icon className="size-4" />{label}</button>)}
        </nav>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => navigateTo("/support")} className="hidden size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] dark:hover:text-white sm:grid" aria-label={ukrainian ? "Підтримка" : "Support"}><HelpCircle className="size-[18px]" /></button>
          <button type="button" onClick={toggleTheme} className="grid size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] dark:hover:text-white" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</button>
          <button type="button" onClick={() => navigateTo("/?app=profile")} className="hidden items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold transition hover:bg-[#e9efea] dark:hover:bg-white/[.07] sm:flex"><span className="grid size-7 place-items-center overflow-hidden rounded-lg bg-[#dff2e5] text-xs font-bold text-[#147645] dark:bg-[#00ff88]/12 dark:text-[#6eecad]">{shellUser.avatarUrl ? <img src={shellUser.avatarUrl} alt="" className="size-full object-cover" /> : (shellUser.firstName || shellUser.username).slice(0, 1).toUpperCase()}</span><span className="max-w-28 truncate">{shellUser.firstName || shellUser.username}</span></button>
          <button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></button>
        </div>
      </div>
    </header>
    {mobileOpen && <div className="fixed inset-0 z-[70] bg-[#07100a]/38 p-3 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true"><div className="ml-auto flex h-full w-full max-w-sm flex-col rounded-[28px] bg-[#fbfcfa] p-5 shadow-2xl dark:bg-[#101b13]"><div className="flex items-center justify-between"><span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-.05em]">StudyCod</span><button type="button" onClick={() => setMobileOpen(false)} className="grid size-10 place-items-center rounded-xl bg-[#eef3ee] dark:bg-white/[.06]"><X className="size-5" /></button></div><nav className="mt-8 space-y-1">{nav.map(({ key, label, icon: Icon, path }) => <button key={key} type="button" onClick={() => navigateTo(path)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold ${current === key ? "bg-[#183524] text-white dark:bg-[#edf4ef] dark:text-[#0b120d]" : "text-[#506057] dark:text-[#bdc9c0]"}`}><Icon className="size-5" />{label}</button>)}</nav><div className="mt-auto border-t border-[#152219]/8 pt-4 dark:border-white/[.08]"><button type="button" onClick={() => { localStorage.removeItem("token"); navigateTo("/"); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-[#d34e72] dark:text-[#ff9aba]"><LogOut className="size-5" />{ukrainian ? "Вийти" : "Sign out"}</button></div></div></div>}
    <main className="flex-1">{children}</main>
    <PlatformFooter />
  </div>;
};
