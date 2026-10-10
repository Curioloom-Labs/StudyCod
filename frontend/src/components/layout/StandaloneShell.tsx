import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
  ShieldCheck,
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
import { PageLoader } from "../ui/PageLoadingTransition";
import { PlatformFooter } from "./PlatformFooter";
import { DialogA11yObserver } from "../ui/DialogA11yObserver";
import { withDevPreview } from "../../lib/devPreview";

type Props = {
  current: "home" | "tasks" | "grades" | "profile" | "learn" | "catalog" | "library" | "playground" | "blog" | "support" | "admin";
  children: React.ReactNode;
};

let cachedSession: User | null = null;

async function signOutEverywhere(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } catch {
    // Local cleanup must still happen when the network is unavailable.
  }
  clearControlExamSession();
  clearGetMeCache({ clearSnapshot: true });
  cachedSession = null;
}

export const StandaloneShell: React.FC<Props> = ({ current, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const ukrainian = !i18n.language.toLowerCase().startsWith("en");
  const [user, setUser] = React.useState<User | null>(() => cachedSession);
  const [loading, setLoading] = React.useState(!cachedSession);
  const [theme, setTheme] = React.useState<AppTheme>(getCurrentTheme);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const devPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";

  const shellUser: User | null = user ?? (devPreview ? {
    id: -1,
    username: ukrainian ? "Демо" : "Demo",
    firstName: ukrainian ? "Демо" : "Demo",
    activeRuntime: "PYTHON",
    difus: 0,
    avatarUrl: null,
    userMode: "PERSONAL",
  } : null);

  React.useEffect(() => {
    if (user || devPreview) {
      setLoading(false);
      return;
    }
    let active = true;
    getMe({ suppressAuthRedirect: true })
      .then((nextUser) => {
        cachedSession = nextUser;
        if (active) setUser(nextUser);
      })
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user]);

  React.useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountRef.current?.contains(event.target as Node)) return;
      setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  React.useEffect(() => {
    if (!accountOpen) return;
    const frame = window.requestAnimationFrame(() => {
      accountMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountOpen]);

  const toggleTheme = () => setTheme((previous) => {
    const next = previous === "dark" ? "light" : "dark";
    applyTheme(next);
    return next;
  });

  if (loading) return <PageLoader />;
  if (!shellUser) return <>{children}</>;

  const education = shellUser.userMode === "EDUCATIONAL";
  if (education && current === "catalog") {
    return <Navigate to={shellUser.studentId ? "/edu/lessons" : "/edu"} replace />;
  }
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
        ...((shellUser.role === "SYSTEM_ADMIN") ? [{ key: "admin", label: ukrainian ? "Адміністрування" : "Admin", icon: ShieldCheck, path: "/?app=admin" }] : []),
        { key: "library", label: ukrainian ? "Бібліотека" : "Library", icon: BookOpen, path: "/library" },
        { key: "catalog", label: ukrainian ? "Курси" : "Courses", icon: Compass, path: "/learning/catalog" },
        { key: "playground", label: ukrainian ? "Пісочниця" : "Playground", icon: PlaySquare, path: "/playground" },
        ...((shellUser.role === "SUPPORT" || shellUser.role === "SYSTEM_ADMIN") ? [{ key: "support", label: ukrainian ? "Стіл підтримки" : "Support desk", icon: HelpCircle, path: "/support/desk" }] : []),
      ];

  const navigateTo = (path: string) => {
    setMobileOpen(false);
    setAccountOpen(false);
    navigate(withDevPreview(path, location.search));
  };

  const displayName = shellUser.firstName || shellUser.username;

  return (
    <div ref={shellRef} className="mobile-app-shell flex min-h-[100dvh] flex-col bg-bg-base text-text-primary transition-colors">
      <a className="skip-link" href="#main-content">{ukrainian ? "Перейти до основного вмісту" : "Skip to main content"}</a>
      <DialogA11yObserver rootRef={shellRef} />
      <header className="sticky top-0 z-50 border-b border-border/50 bg-bg-base/92 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-1.5 px-2.5 sm:h-16 sm:gap-2 sm:px-6 lg:px-9">
          <button type="button" onClick={() => navigateTo(education ? (shellUser.studentId ? "/edu/lessons" : "/edu") : "/")} className="flex min-h-11 shrink-0 items-center gap-2.5 text-left">
            <span className="grid size-8 place-items-center rounded-xl bg-[#173423] sm:size-9">
              <Logo size={20} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-.055em] max-[359px]:hidden sm:text-[19px]">StudyCod</span>
          </button>

          <nav aria-label={ukrainian ? "Основна навігація" : "Primary navigation"} className="hidden min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap min-[1080px]:flex">
            {nav.map(({ key, label, icon: Icon, path }) => (
              <button key={key} type="button" onClick={() => navigateTo(path)} aria-current={current === key ? "page" : undefined} className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition xl:px-3.5 xl:text-sm ${current === key ? "text-primary-strong dark:text-primary-soft" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-bg-surface/[.07] dark:hover:text-white"}`}>
                <Icon className="size-4" />
                {label}
                {current === key ? <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {!education ? (
              <button type="button" onClick={() => void i18n.changeLanguage(ukrainian ? "en" : "uk")} className="grid size-11 place-items-center rounded-xl px-1 text-[11px] font-bold text-text-muted transition hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-bg-surface/[.07] dark:hover:text-white sm:w-auto sm:px-3 sm:text-xs">
                {ukrainian ? "EN" : "UA"}
              </button>
            ) : null}
            <button type="button" onClick={() => navigateTo("/support")} className="hidden size-10 place-items-center rounded-xl text-text-muted transition hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-bg-surface/[.07] dark:hover:text-white sm:grid" aria-label={ukrainian ? "Підтримка" : "Support"}>
              <HelpCircle className="size-[18px]" />
            </button>
            <button type="button" onClick={toggleTheme} className="grid size-10 max-lg:size-11 place-items-center rounded-xl text-text-muted transition hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-bg-surface/[.07] dark:hover:text-white" aria-label={theme === "dark" ? (ukrainian ? "Увімкнути світлу тему" : "Switch to light theme") : (ukrainian ? "Увімкнути темну тему" : "Switch to dark theme")}>
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
            <div className="relative" ref={accountRef}>
              <button ref={accountTriggerRef} type="button" onClick={() => setAccountOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setAccountOpen(true); } }} data-motion-press className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold transition motion-safe:active:scale-[.97] hover:bg-bg-hover dark:hover:bg-white/[.07]" aria-haspopup="menu" aria-expanded={accountOpen} aria-label={ukrainian ? `Відкрити меню акаунта ${displayName}` : `Open account menu for ${displayName}`}>
                <span className="grid size-7 place-items-center overflow-hidden rounded-lg bg-[#dff2e5] text-xs font-bold text-[#147645] dark:bg-primary/12 dark:text-[#6eecad]">
                  {shellUser.avatarUrl ? <img src={shellUser.avatarUrl} alt="" width={28} height={28} loading="lazy" className="size-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[190px] truncate sm:inline">{displayName}</span>
                <span className={`hidden text-xs text-[#748177] transition sm:inline ${accountOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {accountOpen ? (
              <div ref={accountMenuRef} data-material="standalone-account-menu" data-motion-surface className="material-popover absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-border/70 bg-bg-surface p-2 shadow-[var(--ui-modal-shadow)]" role="menu" aria-label={ukrainian ? "Меню акаунта" : "Account menu"} onKeyDown={(event) => {
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"));
                  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    items[(currentIndex + direction + items.length) % items.length]?.focus();
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    items[0]?.focus();
                  } else if (event.key === "End") {
                    event.preventDefault();
                    items[items.length - 1]?.focus();
                  }
                }}>
                  <div className="px-3 py-3">
                    <div className="truncate text-sm font-semibold text-text-primary">{shellUser.username}</div>
                    <div className="mt-1 truncate text-xs uppercase tracking-[.08em] text-[#718075] dark:text-text-secondary">{shellUser.userMode || "PERSONAL"}</div>
                  </div>
                  <button type="button" onClick={() => navigateTo("/?app=profile")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-bg-hover dark:hover:bg-bg-hover" role="menuitem">
                    <UserRound className="size-4" />
                    {ukrainian ? "Профіль" : "Profile"}
                  </button>
                  <button type="button" onClick={() => navigateTo("/support")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-bg-hover dark:hover:bg-bg-hover" role="menuitem">
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
            <button type="button" onClick={() => setMobileOpen(true)} className="grid size-11 place-items-center rounded-xl text-[#627166] transition hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.07] min-[1080px]:hidden" aria-label={ukrainian ? "Відкрити навігацію" : "Open navigation"}>
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div data-material="standalone-drawer-scrim" className="fixed inset-0 z-[70] flex items-end bg-black/40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
          <div data-material="standalone-drawer" className="flex max-h-[85dvh] w-full flex-col overflow-y-auto rounded-[28px] border border-border/70 bg-bg-surface p-5 shadow-[var(--ui-modal-shadow)]" role="dialog" aria-modal="true" aria-label={ukrainian ? "Мобільна навігація" : "Mobile navigation"} tabIndex={-1}>
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-.05em]">StudyCod</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label={ukrainian ? "Закрити навігацію" : "Close navigation"} className="grid size-10 max-lg:size-11 place-items-center rounded-xl bg-bg-hover">
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-8 space-y-1">
              {nav.map(({ key, label, icon: Icon, path }) => (
                <button key={key} type="button" onClick={() => navigateTo(path)} aria-current={current === key ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold ${current === key ? "bg-primary-strong text-primary-foreground dark:bg-primary/12 dark:text-primary-soft" : "text-text-secondary hover:bg-bg-hover dark:hover:bg-bg-hover"}`}>
                  <Icon className="size-5" />
                  {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto border-t border-border/8 pt-4 dark:border-white/[.08]">
              <button type="button" onClick={() => { void signOutEverywhere().finally(() => navigateTo("/")); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-semibold text-[#d34e72] dark:text-[#ff9aba]">
                <LogOut className="size-5" />
                {ukrainian ? "Вийти" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main id="main-content" tabIndex={-1} className="mobile-app-viewport min-w-0 flex-1 outline-none">{children}</main>
      <PlatformFooter />
    </div>
  );
};
