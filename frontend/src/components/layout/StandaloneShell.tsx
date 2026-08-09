import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Code2,
  Compass,
  GraduationCap,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  Moon,
  PlaySquare,
  Sun,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import type { User } from "../../types";
import { getMe } from "../../lib/api/profile";
import { api } from "../../lib/api/client";
import { clearGetMeCache } from "../../lib/api/profile";
import { clearControlExamSession } from "../../lib/controlExamSession";
import { applyTheme, getCurrentTheme, type AppTheme } from "../../theme";
import { Logo } from "../Logo";
import { BrandedPageLoader } from "../ui/BrandedPageLoader";
import { PlatformFooter } from "./PlatformFooter";

type Props = {
  current: "home" | "tasks" | "grades" | "profile" | "learn" | "library" | "playground" | "blog";
  children: React.ReactNode;
};

let cachedSession: { token: string; user: User } | null = null;

async function signOutEverywhere(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } catch {
    // Local cleanup must still happen when the network is unavailable.
  }
  try {
    localStorage.removeItem("token");
  } catch {
    // Ignore private-mode/storage errors.
  }
  clearControlExamSession();
  clearGetMeCache({ clearSnapshot: true });
  cachedSession = null;
}

const tokenFromStorage = () => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

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
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const devPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";

  const shellUser: User | null = user ?? (devPreview ? {
    id: -1,
    username: ukrainian ? "Демо" : "Demo",
    firstName: ukrainian ? "Демо" : "Demo",
    course: "PYTHON",
    difus: 0,
    avatarUrl: null,
    userMode: "PERSONAL",
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
    return () => {
      active = false;
    };
  }, [token, user]);

  React.useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountRef.current?.contains(event.target as Node)) return;
      setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

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
        { key: "learn", label: shellUser.studentId ? (ukrainian ? "Уроки" : "Lessons") : (ukrainian ? "Класи" : "Classes"), icon: GraduationCap, path: shellUser.studentId ? "/edu/lessons" : "/edu" },
        { key: "grades", label: ukrainian ? "Журнал" : "Journal", icon: Trophy, path: shellUser.studentId ? "/edu/journal" : "/edu/gradebook" },
        { key: "tasks", label: ukrainian ? "Календар" : "Calendar", icon: Compass, path: "/edu/calendar" },
        { key: "library", label: ukrainian ? "Бібліотека" : "Library", icon: BookOpen, path: "/edu/library" },
      ]
    : [
        { key: "home", label: ukrainian ? "Огляд" : "Overview", icon: Home, path: "/" },
        { key: "tasks", label: ukrainian ? "Практика" : "Practice", icon: Code2, path: "/?app=tasks" },
        { key: "grades", label: ukrainian ? "Прогрес" : "Progress", icon: Trophy, path: "/?app=grades" },
        { key: "library", label: ukrainian ? "Бібліотека" : "Library", icon: BookOpen, path: "/library" },
        { key: "playground", label: ukrainian ? "Пісочниця" : "Playground", icon: PlaySquare, path: "/playground" },
      ];

  const navigateTo = (path: string) => {
    setMobileOpen(false);
    setAccountOpen(false);
    const destination = devPreview ? `${path}${path.includes("?") ? "&" : "?"}preview=true` : path;
    navigate(destination);
  };

  const displayName = shellUser.firstName || shellUser.username;

  return (
    <div className="mobile-app-shell min-h-[100dvh] bg-[#f5f7f4] text-[#17231b] transition-colors dark:bg-[#09100c] dark:text-[#edf4ef]">
      <header className="sticky top-0 z-50 border-b border-[#16281b]/10 bg-[#f5f7f4]/86 backdrop-blur-xl dark:border-white/[.08] dark:bg-[#09100c]/84">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-9">
          <button type="button" onClick={() => navigateTo(education ? (shellUser.studentId ? "/edu/lessons" : "/edu") : "/")} className="flex shrink-0 items-center gap-2.5 text-left">
            <span className="grid size-10 place-items-center rounded-[14px] bg-[#183524] shadow-[0_8px_20px_rgba(14,41,26,.12)]">
              <Logo size={20} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-[-.055em]">StudyCod</span>
          </button>

          <nav aria-label={ukrainian ? "Основна навігація" : "Primary navigation"} className="hidden items-center gap-1 rounded-2xl border border-[#152219]/8 bg-white/70 p-1.5 shadow-[0_10px_28px_rgba(23,45,29,.04)] dark:border-white/[.08] dark:bg-white/[.035] lg:flex">
            {nav.map(({ key, label, icon: Icon, path }) => (
              <button key={key} type="button" onClick={() => navigateTo(path)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${current === key ? "bg-[#18291e] text-white shadow-sm dark:bg-[#eaf2eb] dark:text-[#0c140f]" : "text-[#637267] hover:bg-[#edf2ed] hover:text-[#152219] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            {!education ? (
              <button type="button" onClick={() => void i18n.changeLanguage(ukrainian ? "en" : "uk")} className="hidden h-10 rounded-xl px-3 text-xs font-semibold text-[#627166] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] dark:hover:text-white sm:block">
                {ukrainian ? "EN" : "UA"}
              </button>
            ) : null}
            <button type="button" onClick={() => navigateTo("/support")} className="hidden size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] dark:hover:text-white sm:grid" aria-label={ukrainian ? "Підтримка" : "Support"}>
              <HelpCircle className="size-[18px]" />
            </button>
            <button type="button" onClick={toggleTheme} className="grid size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] dark:hover:text-white" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
            <div className="relative hidden sm:block" ref={accountRef}>
              <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold transition hover:bg-[#e9efea] dark:hover:bg-white/[.07]" aria-haspopup="menu" aria-expanded={accountOpen}>
                <span className="grid size-7 place-items-center overflow-hidden rounded-lg bg-[#dff2e5] text-xs font-bold text-[#147645] dark:bg-[#00ff88]/12 dark:text-[#6eecad]">
                  {shellUser.avatarUrl ? <img src={shellUser.avatarUrl} alt="" className="size-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[190px] truncate">{displayName}</span>
                <span className={`text-xs text-[#748177] transition ${accountOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {accountOpen ? (
                <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-[#152219]/10 bg-white p-2 shadow-[0_24px_70px_-38px_rgba(15,35,21,.55)] dark:border-white/10 dark:bg-[#121b15]" role="menu">
                  <div className="px-3 py-3">
                    <div className="truncate text-sm font-semibold text-[#17231b] dark:text-white">{shellUser.username}</div>
                    <div className="mt-1 truncate text-xs uppercase tracking-[.08em] text-[#718075] dark:text-[#a4b3a8]">{shellUser.userMode || "PERSONAL"}</div>
                  </div>
                  <button type="button" onClick={() => navigateTo("/?app=profile")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#314037] transition hover:bg-[#f1f5f1] dark:text-[#dce8de] dark:hover:bg-white/[.06]" role="menuitem">
                    <UserRound className="size-4" />
                    {ukrainian ? "Профіль" : "Profile"}
                  </button>
                  <button type="button" onClick={() => navigateTo("/support")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#5d6b62] transition hover:bg-[#f1f5f1] dark:text-[#aab7ae] dark:hover:bg-white/[.06]" role="menuitem">
                    <HelpCircle className="size-4" />
                    {ukrainian ? "Підтримка" : "Support"}
                  </button>
                  <button type="button" onClick={() => { void signOutEverywhere().finally(() => navigateTo("/")); }} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#d34e72] transition hover:bg-[#fff0f4] dark:text-[#ff9aba] dark:hover:bg-[#ff6b9d]/10" role="menuitem">
                    <LogOut className="size-4" />
                    {ukrainian ? "Вийти" : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-xl text-[#627166] transition hover:bg-[#e9efea] dark:text-[#a4b3a8] dark:hover:bg-white/[.07] lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-[#07100a]/38 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true">
          <div className="flex max-h-[85dvh] w-full flex-col overflow-y-auto rounded-[28px] bg-[#fbfcfa] p-5 shadow-2xl dark:bg-[#101b13]">
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-.05em]">StudyCod</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="grid size-10 place-items-center rounded-xl bg-[#eef3ee] dark:bg-white/[.06]">
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-8 space-y-1">
              {nav.map(({ key, label, icon: Icon, path }) => (
                <button key={key} type="button" onClick={() => navigateTo(path)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold ${current === key ? "bg-[#183524] text-white dark:bg-[#edf4ef] dark:text-[#0b120d]" : "text-[#506057] dark:text-[#bdc9c0]"}`}>
                  <Icon className="size-5" />
                  {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto border-t border-[#152219]/8 pt-4 dark:border-white/[.08]">
              <button type="button" onClick={() => { void signOutEverywhere().finally(() => navigateTo("/")); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-[#d34e72] dark:text-[#ff9aba]">
                <LogOut className="size-5" />
                {ukrainian ? "Вийти" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mobile-app-viewport flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#152219]/10 bg-[#f5f7f4]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#09100c]/95 lg:hidden" aria-label={ukrainian ? "Мобільна навігація" : "Mobile navigation"}>
        <div className="grid grid-cols-5 gap-1">
          {[
            ...(!education ? [nav.find((item) => item.key === "home")] : [nav[0]]),
            ...(!education ? [nav.find((item) => item.key === "tasks")] : [nav[1]]),
            ...(!education ? [nav.find((item) => item.key === "library")] : [nav[3]]),
            ...(!education ? [nav.find((item) => item.key === "playground")] : [nav[2]]),
          ].filter((item): item is (typeof nav)[number] => Boolean(item)).map(({ key, label, icon: Icon, path }) => (
            <button key={`mobile-primary-${key}`} type="button" onClick={() => navigateTo(path)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition ${current === key ? "bg-[#183524] text-white dark:bg-[#00ff88]/12 dark:text-[#72edb0]" : "text-[#637267] hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>
              <Icon className="size-4" />
              <span className="max-w-full truncate text-[10px] font-semibold leading-none">{label}</span>
            </button>
          ))}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[#637267] transition hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white" aria-label={ukrainian ? "Ще" : "More"}>
            <Menu className="size-4" />
            <span className="text-[10px] font-semibold leading-none">{ukrainian ? "Ще" : "More"}</span>
          </button>
        </div>
      </nav>
      <PlatformFooter />
    </div>
  );
};
