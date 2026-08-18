import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  HelpCircle,
  Home,
  Library,
  LogOut,
  Moon,
  PlaySquare,
  ShieldCheck,
  Sun,
  Trophy,
} from "lucide-react";
import { Logo } from "../Logo";
import { PlatformFooter } from "./PlatformFooter";
import type { User } from "../../types";
import type { AppTheme } from "../../theme";
import { usePersonalLearning } from "../learning/PersonalLearningProvider";

type Page = "home" | "tasks" | "grades" | "plan" | "profile" | "teacher" | "student" | "admin";
type NavId = Page | "library" | "playground";
type NavItem = { id: NavId; label: string; Icon: React.ElementType<{ className?: string }>; onClick?: () => void };

type ShellProps = {
  user: User;
  page: Page;
  theme: AppTheme;
  onNavigate: (page: Page) => void;
  onLibrary: () => void;
  onCourses: () => void;
  onPlayground: () => void;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onSupport?: () => void;
  onSupportDesk?: () => void;
  onLogout: () => void;
  children: React.ReactNode;
  area?: "learning" | "lab";
  courseTab?: "overview" | "path" | "practice" | "progress";
};

export const PremiumWorkspaceShell: React.FC<ShellProps> = ({
  user,
  page,
  theme,
  onNavigate,
  onLibrary,
  onCourses,
  onPlayground,
  onToggleTheme,
  onToggleLanguage,
  onSupport,
  onSupportDesk,
  onLogout,
  children,
  area = "learning",
  courseTab = "overview",
}) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const learning = usePersonalLearning();
  const nextPractice = learning.currentCourse?.modules
    .flatMap((module) => module.items)
    .find((item) => item.kind === "CODE_TASK" && item.progress.status !== "COMPLETED");

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

  const routeIsActive = (path: string) => window.location.pathname === path || window.location.pathname.startsWith(`${path}/`);
  const nav: NavItem[] = [
    { id: "home", label: uk ? "Навчання" : "Learning", Icon: Home },
    { id: "library", label: uk ? "Бібліотека" : "Library", Icon: Library, onClick: onLibrary },
    { id: "playground", label: uk ? "Пісочниця" : "Playground", Icon: PlaySquare, onClick: onPlayground },
    ...(user.role === "SYSTEM_ADMIN"
      ? [{ id: "admin" as const, label: uk ? "Адміністрування" : "Admin", Icon: ShieldCheck }]
      : []),
  ];

  const active = (id: NavId) => {
    if (id === "library") return routeIsActive("/lab/library") || routeIsActive("/library");
    if (id === "playground") return routeIsActive("/lab/playground") || routeIsActive("/playground");
    return page === id;
  };
  const displayName = user.firstName || user.username;
  const modeLabel = user.userMode || "PERSONAL";
  const initial = displayName.slice(0, 1).toUpperCase();
  const goProfile = () => {
    setAccountOpen(false);
    onNavigate("profile");
  };
  const goSupport = () => {
    setAccountOpen(false);
    if (onSupport) onSupport();
    else navigate("/support");
  };
  const goSupportDesk = () => {
    setAccountOpen(false);
    if (onSupportDesk) onSupportDesk();
    else navigate("/support/desk");
  };
  const hasSupportDesk = user.role === "SUPPORT" || user.role === "SYSTEM_ADMIN";
  const isAdmin = user.role === "SYSTEM_ADMIN";

  return (
    <div className="mobile-app-shell flex min-h-[100dvh] flex-col bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
      <header className="sticky top-0 z-50 bg-[#f7f8f5]/82 backdrop-blur-xl dark:bg-[#0b120e]/82">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="flex shrink-0 items-center gap-2.5 text-left"
            aria-label={isAdmin ? (uk ? "На головну адмінки StudyCod" : "Go to StudyCod admin home") : (uk ? "На головну сторінку StudyCod" : "Go to StudyCod home")}
            title={isAdmin ? (uk ? "Головна адмінки" : "Admin home") : (uk ? "На головну" : "Home")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#153321]">
              <Logo size={19} />
            </span>
            <span className="hidden font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em] xl:inline">StudyCod</span>
          </button>

          <nav className="mx-auto hidden w-fit max-w-[calc(100%-2rem)] flex-none items-center justify-center gap-1 overflow-x-auto rounded-xl bg-[#edf1ed] p-1 whitespace-nowrap dark:bg-white/[.055] lg:flex" aria-label={uk ? "Основна навігація" : "Primary navigation"}>
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => item.onClick ? item.onClick() : onNavigate(item.id as Page)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${
                  active(item.id)
                    ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]"
                    : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"
                }`}
              >
                <item.Icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07]"
              aria-label={theme === "dark"
                ? (uk ? "Перемкнути на світлу тему" : "Switch to light theme")
                : (uk ? "Перемкнути на темну тему" : "Switch to dark theme")}
              title={theme === "dark" ? (uk ? "Світла тема" : "Light theme") : (uk ? "Темна тема" : "Dark theme")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === "dark" ? (uk ? "Світла" : "Light") : (uk ? "Темна" : "Dark")}</span>
            </button>
            <button
              type="button"
              onClick={onToggleLanguage}
              className="hidden h-9 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07] sm:block"
              aria-label={uk ? "Перемкнути на англійську" : "Switch to Ukrainian"}
              title={uk ? "English" : "Українська"}
            >
              {uk ? "EN" : "UA"}
            </button>

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label={uk ? `Відкрити меню акаунта ${displayName}` : `Open account menu for ${displayName}`}
                title={uk ? "Меню акаунта" : "Account menu"}
                className={`flex h-10 items-center gap-2 rounded-xl px-1.5 pr-2.5 transition ${
                  active("profile") || accountOpen
                    ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]"
                    : "hover:bg-[#e9eeea] dark:hover:bg-white/[.07]"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-[#18261d] text-xs font-bold text-[#70edaf] dark:bg-[#edf3ef] dark:text-[#0b120e]">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                </span>
                <span className="hidden max-w-[190px] truncate text-sm font-semibold sm:block">{displayName}</span>
                <ChevronDown className={`hidden h-3.5 w-3.5 transition sm:block ${accountOpen ? "rotate-180" : ""}`} />
              </button>

              {accountOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-2xl border border-[#152219]/10 bg-white p-2 shadow-[0_24px_70px_-38px_rgba(15,35,21,.55)] dark:border-white/10 dark:bg-[#121b15] max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] max-sm:top-auto max-sm:w-auto max-sm:rounded-3xl max-sm:p-3" role="menu">
                  <div className="px-3 py-3">
                    <div className="truncate text-sm font-semibold text-[#17231b] dark:text-white">{user.username}</div>
                    <div className="mt-1 truncate text-xs uppercase tracking-[.08em] text-[#718075] dark:text-[#a4b3a8]">{modeLabel}</div>
                  </div>
                  <button type="button" onClick={goProfile} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#314037] transition hover:bg-[#f1f5f1] dark:text-[#dce8de] dark:hover:bg-white/[.06]" role="menuitem">
                    <CircleUserRound className="h-4 w-4" />
                    {uk ? "Профіль" : "Profile"}
                  </button>
                   <button type="button" onClick={goSupport} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#5d6b62] transition hover:bg-[#f1f5f1] dark:text-[#aab7ae] dark:hover:bg-white/[.06]" role="menuitem">
                     <HelpCircle className="h-4 w-4" />
                     {uk ? "Підтримка" : "Support"}
                   </button>
                   {hasSupportDesk ? <button type="button" onClick={goSupportDesk} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#5d6b62] transition hover:bg-[#f1f5f1] dark:text-[#aab7ae] dark:hover:bg-white/[.06]" role="menuitem">
                     <HelpCircle className="h-4 w-4" />
                     Support desk
                   </button> : null}
                  <button type="button" onClick={onLogout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#d34e72] transition hover:bg-[#fff0f4] dark:text-[#ff9aba] dark:hover:bg-[#ff6b9d]/10" role="menuitem">
                    <LogOut className="h-4 w-4" />
                    {uk ? "Вийти" : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

      </header>
      {area === "learning" && page !== "admin" && learning.currentCourse ? (
        <div className="sticky top-[72px] z-40 border-b border-[#152219]/8 bg-[#f7f8f5]/92 backdrop-blur-xl dark:border-white/[.07] dark:bg-[#0b120e]/92">
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-10">
            <div className="relative shrink-0">
              <select aria-label={uk ? "Поточний курс" : "Current course"} value={learning.me?.currentEnrollmentId ?? ""} onChange={(event) => { const id = Number(event.target.value); if (id) void learning.selectCourse(id); else if (event.target.value === "catalog") onCourses(); }} className="appearance-none rounded-xl border border-[#00c875]/35 bg-[#e8f6ed] px-3 py-2 pr-8 text-sm font-semibold text-[#153321] outline-none dark:bg-[#00ff88]/10 dark:text-[#bfffd9]">
                {learning.me?.enrollments.filter((item) => item.status === "IN_PROGRESS" || item.status === "COMPLETED").map((item) => <option key={item.enrollmentId} value={item.enrollmentId}>{item.title}</option>)}
                <option value="catalog">{uk ? "Додати курс…" : "Add a course…"}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2" />
            </div>
            <div className="hidden h-5 w-px bg-[#152219]/12 dark:bg-white/10 sm:block" />
            {[{ id: "overview", label: uk ? "Огляд" : "Overview", path: `/learning/course/${learning.currentCourse.id}/overview` }, { id: "path", label: uk ? "Теми" : "Topics", path: `/learning/course/${learning.currentCourse.id}/path` }, { id: "practice", label: uk ? "Практика" : "Practice", path: nextPractice ? `/learning/course/${learning.currentCourse.id}/practice/${nextPractice.id}` : `/learning/course/${learning.currentCourse.id}/path` }].map((tab) => <button key={tab.id} type="button" aria-current={courseTab === tab.id ? "page" : undefined} onClick={() => navigate(tab.path)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${courseTab === tab.id ? "bg-[#183524] text-white dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#617168] hover:bg-[#eaf0eb] dark:text-[#aab7ae] dark:hover:bg-white/[.06]"}`}>{tab.label}</button>)}
            <div className="ml-auto hidden items-center gap-2 text-xs font-semibold text-[#657368] sm:flex dark:text-[#a5b3a9]"><span>{Math.round(learning.currentCourse.enrollment.completionPercent)}%</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#dce6df] dark:bg-white/10"><span className="block h-full rounded-full bg-[#00d782]" style={{ width: `${Math.min(100, Math.max(0, learning.currentCourse.enrollment.completionPercent))}%` }} /></span></div>
          </div>
        </div>
      ) : null}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#152219]/10 bg-[#f7f8f5]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#0b120e]/95 lg:hidden" aria-label={uk ? "Мобільна навігація" : "Mobile navigation"}>
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: "home" as const, label: nav.find((item) => item.id === "home")?.label ?? "Home", Icon: Home, onClick: () => onNavigate("home") },
            { id: "library" as const, label: nav.find((item) => item.id === "library")?.label ?? "Library", Icon: Library, onClick: onLibrary },
            { id: "playground" as const, label: nav.find((item) => item.id === "playground")?.label ?? "Playground", Icon: PlaySquare, onClick: onPlayground },
          ].map(({ id, label, Icon, onClick }) => (
            <button key={id} type="button" onClick={onClick} aria-current={active(id) ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${active(id) ? "bg-[#183524] text-white dark:bg-[#00ff88]/12 dark:text-[#72edb0]" : "text-[#637267] hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>
              <Icon className="size-4" />
              <span className="max-w-full truncate leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <main className="mobile-app-viewport min-w-0 flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <PlatformFooter />
    </div>
  );
};
