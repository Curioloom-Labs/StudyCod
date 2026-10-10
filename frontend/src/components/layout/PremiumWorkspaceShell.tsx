import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  HelpCircle,
  Home,
  Languages,
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
import { SelectMenu } from "../ui/SelectMenu";
import { DialogA11yObserver } from "../ui/DialogA11yObserver";
import { WorkspaceTopNavigation } from "./WorkspaceTopNavigation";
import { withDevPreview } from "../../lib/devPreview";

type Page = "home" | "tasks" | "grades" | "plan" | "profile" | "teacher" | "student" | "admin";
type NavId = Page | "library" | "playground" | "contests";
type NavItem = { id: NavId; label: string; Icon: React.ElementType<{ className?: string }>; onClick?: () => void };

type ShellProps = {
  user: User;
  page: Page | "contests";
  theme: AppTheme;
  onNavigate: (page: Page) => void;
  onLibrary: () => void;
  onCourses: () => void;
  onPlayground: () => void;
  onContests?: () => void;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onSupport?: () => void;
  onSupportDesk?: () => void;
  onLogout: () => void;
  children: React.ReactNode;
  area?: "learning" | "lab" | "contest";
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
  onContests,
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
  const accountTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);
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

  const routeIsActive = (path: string) => window.location.pathname === path || window.location.pathname.startsWith(`${path}/`);
  const nav: NavItem[] = [
    { id: "home", label: uk ? "Навчання" : "Learning", Icon: Home },
    { id: "contests", label: uk ? "Контести" : "Contests", Icon: Trophy, onClick: onContests ?? (() => navigate("/contest/contests")) },
    { id: "library", label: uk ? "Бібліотека" : "Library", Icon: Library, onClick: onLibrary },
    { id: "playground", label: uk ? "Пісочниця" : "Playground", Icon: PlaySquare, onClick: onPlayground },
    ...(user.role === "SYSTEM_ADMIN"
      ? [{ id: "admin" as const, label: uk ? "Адміністрування" : "Admin", Icon: ShieldCheck }]
      : []),
  ];

  const active = (id: NavId) => {
    if (id === "contests") return routeIsActive("/contest/contests");
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
  const showCourseNavigation = area === "learning" && page !== "admin" && Boolean(learning.currentCourse);
  return (
    <div ref={shellRef} className={`mobile-app-shell flex min-h-[100dvh] flex-col bg-bg-base text-text-primary ${showCourseNavigation ? "has-course-context" : ""}`}>
      <a className="skip-link" href="#main-content">{uk ? "Перейти до основного вмісту" : "Skip to main content"}</a>
      <DialogA11yObserver rootRef={shellRef} />
      <header data-material="premium-header" className="sticky top-0 z-50 border-b border-border/50 bg-bg-base/92 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 max-[360px]:gap-1 max-[360px]:px-2 sm:h-16 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="flex min-h-11 shrink-0 items-center gap-2.5 text-left max-[360px]:gap-1.5"
            aria-label={isAdmin ? (uk ? "На головну адмінки StudyCod" : "Go to StudyCod admin home") : (uk ? "На головну сторінку StudyCod" : "Go to StudyCod home")}
            title={isAdmin ? (uk ? "Головна адмінки" : "Admin home") : (uk ? "На головну" : "Home")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#173423] max-[360px]:h-8 max-[360px]:w-8">
              <Logo size={19} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-.04em] max-[360px]:text-sm sm:text-lg">StudyCod</span>
          </button>

          <WorkspaceTopNavigation
            label={uk ? "Основна навігація" : "Primary navigation"}
            closeLabel={uk ? "Закрити навігацію" : "Close navigation"}
            items={nav.map((item) => ({
              label: item.label,
              Icon: item.Icon,
              active: active(item.id),
              onSelect: () => item.onClick ? item.onClick() : onNavigate(item.id as Page),
            }))}
          />

          <div className="flex shrink-0 items-center gap-1.5 max-[360px]:gap-1 sm:gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              data-motion-press
              className="flex h-9 max-lg:min-h-11 max-lg:min-w-11 items-center justify-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-text-muted transition motion-safe:active:scale-[.97] hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-bg-surface/[.07]"
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
              data-motion-press
              className="grid h-9 max-lg:min-h-11 max-lg:min-w-11 place-items-center rounded-xl px-2.5 text-xs font-semibold text-text-muted transition motion-safe:active:scale-[.97] hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-bg-surface/[.07]"
              aria-label={uk ? "Перемкнути на англійську" : "Switch to Ukrainian"}
              title={uk ? "English" : "Українська"}
            >
              <Languages className="size-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{uk ? "EN" : "UA"}</span>
            </button>

            <div className="relative" ref={accountRef}>
              <button
                ref={accountTriggerRef}
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setAccountOpen(true);
                  }
                }}
                data-motion-press
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label={uk ? `Відкрити меню акаунта ${displayName}` : `Open account menu for ${displayName}`}
                title={uk ? "Меню акаунта" : "Account menu"}
                className={`flex h-10 max-lg:min-h-11 max-lg:min-w-11 items-center gap-2 rounded-xl px-1.5 pr-2.5 transition motion-safe:active:scale-[.97] ${
                  active("profile") || accountOpen
                    ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"
                    : "hover:bg-bg-hover dark:hover:bg-white/[.07]"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-primary-strong text-xs font-bold text-primary-foreground dark:bg-primary/12 dark:text-primary-soft">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" width={28} height={28} loading="lazy" className="h-full w-full object-cover" /> : initial}
                </span>
                <span className="hidden max-w-[190px] truncate text-sm font-semibold sm:block">{displayName}</span>
                <ChevronDown className={`hidden h-3.5 w-3.5 transition sm:block ${accountOpen ? "rotate-180" : ""}`} />
              </button>

              {accountOpen ? (
                <div ref={accountMenuRef} data-material="account-menu" data-motion-surface className="material-popover absolute right-0 top-[calc(100%+10px)] z-50 w-72 max-w-[calc(100vw-1.25rem)] overflow-hidden rounded-2xl border border-border/70 bg-bg-surface p-2 shadow-[var(--ui-modal-shadow)]" role="menu" aria-label={uk ? "Меню акаунта" : "Account menu"} onKeyDown={(event) => {
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
                    <div className="truncate text-sm font-semibold text-text-primary">{user.username}</div>
                    <div className="mt-1 truncate text-xs uppercase tracking-[.08em] text-[#718075] dark:text-text-secondary">{modeLabel}</div>
                  </div>
                  <button type="button" onClick={goProfile} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-bg-hover dark:hover:bg-bg-hover" role="menuitem">
                    <CircleUserRound className="h-4 w-4" />
                    {uk ? "Профіль" : "Profile"}
                  </button>
                   <button type="button" onClick={goSupport} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-bg-hover dark:hover:bg-bg-hover" role="menuitem">
                     <HelpCircle className="h-4 w-4" />
                     {uk ? "Підтримка" : "Support"}
                   </button>
                   {hasSupportDesk ? <button type="button" onClick={goSupportDesk} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-bg-hover dark:hover:bg-bg-hover" role="menuitem">
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
      <div className="min-w-0 flex-1">
      {showCourseNavigation && learning.currentCourse ? (
        <div data-material="premium-course-nav" className="sticky top-14 z-40 border-b border-border/70 bg-bg-base/92 backdrop-blur-xl sm:top-16">
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-10">
            <SelectMenu
              value={String(learning.me?.currentEnrollmentId ?? "")}
              options={[
                ...(learning.me?.enrollments.filter((item) => item.status === "IN_PROGRESS" || item.status === "COMPLETED").map((item) => ({ value: String(item.enrollmentId), label: item.title })) ?? []),
                { value: "catalog", label: uk ? "Додати курс…" : "Add a course…" },
              ]}
              onChange={(value) => { if (value === "catalog") onCourses(); else void learning.selectCourse(Number(value)); }}
              ariaLabel={uk ? "Поточний курс" : "Current course"}
              menuMinWidth={240}
              className="shrink-0 border-primary/35 bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"
            />
            <div className="hidden h-5 w-px bg-[#152219]/12 dark:bg-white/10 sm:block" />
            {[{ id: "overview", label: uk ? "Огляд" : "Overview", path: `/learning/course/${learning.currentCourse.id}/overview` }, { id: "path", label: uk ? "Теми" : "Topics", path: `/learning/course/${learning.currentCourse.id}/path` }, { id: "practice", label: uk ? "Практика" : "Practice", path: nextPractice ? `/learning/course/${learning.currentCourse.id}/practice/${nextPractice.id}` : `/learning/course/${learning.currentCourse.id}/path` }].map((tab) => <button key={tab.id} type="button" aria-current={courseTab === tab.id ? "page" : undefined} onClick={() => navigate(withDevPreview(tab.path))} className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${courseTab === tab.id ? "bg-primary-strong text-primary-foreground dark:bg-primary/12 dark:text-primary-soft" : "text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-bg-surface/[.06]"}`}>{tab.label}</button>)}
            <div className="ml-auto hidden items-center gap-2 text-xs font-semibold text-text-muted sm:flex"><span>{Math.round(learning.currentCourse.enrollment.completionPercent)}%</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-hover"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, learning.currentCourse.enrollment.completionPercent))}%` }} /></span></div>
          </div>
        </div>
      ) : null}
      {page === "admin" ? (
        <main id="main-content" tabIndex={-1} className="mobile-app-viewport relative min-w-0 flex-1 overflow-x-clip outline-none">{children}</main>
      ) : (
        <div id="main-content" tabIndex={-1} className="mobile-app-viewport relative min-w-0 flex-1 overflow-x-clip outline-none">{children}</div>
      )}
      <PlatformFooter />
      </div>
    </div>
  );
};
