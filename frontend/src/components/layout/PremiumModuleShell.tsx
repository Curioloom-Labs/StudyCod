import React from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Trophy,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo";
import { PlatformFooter } from "./PlatformFooter";
import { DialogA11yObserver } from "../ui/DialogA11yObserver";
import type { AppTheme } from "../../theme";
import type { User } from "../../types";

type Props = {
  product: "EDU" | "CONTEST" | "ADMIN";
  user: User;
  theme: AppTheme;
  currentPath: string;
  navigationHidden?: boolean;
  onNavigate: (path: string) => void;
  onToggleTheme: () => void;
  onLogout: () => void | Promise<void>;
  onEduContextChange?: (studentId: number | null) => void | Promise<void>;
  children: React.ReactNode;
};

export const PremiumModuleShell: React.FC<Props> = ({
  product,
  user,
  theme,
  currentPath,
  navigationHidden = false,
  onNavigate,
  onToggleTheme,
  onLogout,
  onEduContextChange,
  children,
}) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const isTeacher = product === "EDU" && !user.studentId;
  const isSystemAdmin = product === "EDU" && user.role === "SYSTEM_ADMIN";
  const isOrgManager =
    product === "EDU" &&
    user.eduContexts?.organizations?.some((org) => org.role === "ORG_ADMIN");
  const isEduAdmin = isSystemAdmin || isOrgManager;
  const isContestOnly = product === "CONTEST" && user.userMode === "CONTEST";
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);

  const nav =
    product === "ADMIN"
      ? [
          {
            label: uk ? "Адміністративний центр" : "Administration",
            path: "/edu",
            Icon: ShieldCheck,
          },
          {
            label: uk ? "Профіль" : "Profile",
            path: "/profile",
            Icon: UserRound,
          },
          {
            label: uk ? "Контести" : "Contests",
            path: "/contest/contests",
            Icon: Trophy,
          },
        ]
      : product === "EDU"
        ? isTeacher
          ? [
              {
                label: isEduAdmin
                  ? uk
                    ? "Керування закладом"
                    : "Institution management"
                  : uk
                    ? "Класи"
                    : "Classes",
                path:
                  isOrgManager && !isSystemAdmin ? "/edu/organization" : "/edu",
                Icon: isEduAdmin ? ShieldCheck : GraduationCap,
              },
              {
                label: uk ? "Календар" : "Calendar",
                path: "/edu/calendar",
                Icon: CalendarDays,
              },
              {
                label: uk ? "Контести" : "Contests",
                path: "/contest/contests",
                Icon: Trophy,
              },
              {
                label: uk ? "Курси" : "Courses",
                path: "/edu/courses",
                Icon: BookOpen,
              },
              {
                label: uk ? "Бібліотека" : "Library",
                path: "/edu/library",
                Icon: BookOpen,
              },
              {
                label: uk ? "Профіль" : "Profile",
                path: "/edu/profile",
                Icon: UserRound,
              },
            ]
          : [
              {
                label: uk ? "Уроки" : "Lessons",
                path: "/edu/lessons",
                Icon: BookOpen,
              },
              {
                label: uk ? "Журнал" : "Journal",
                path: "/edu/journal",
                Icon: GraduationCap,
              },
              {
                label: uk ? "Календар" : "Calendar",
                path: "/edu/calendar",
                Icon: CalendarDays,
              },
              {
                label: uk ? "Контести" : "Contests",
                path: "/contest/contests",
                Icon: Trophy,
              },
              {
                label: uk ? "Бібліотека" : "Library",
                path: "/edu/library",
                Icon: BookOpen,
              },
              {
                label: uk ? "Профіль" : "Profile",
                path: "/edu/profile",
                Icon: UserRound,
              },
            ]
        : isContestOnly
          ? [
              {
                label: uk ? "Мій контест" : "My contest",
                path: "/contest/contests",
                Icon: Trophy,
              },
            ]
          : [
            {
              label: uk ? "Контести" : "Contests",
              path: "/contest/contests",
              Icon: Trophy,
            },
            {
              label: uk ? "Профіль" : "Profile",
              path: "/profile",
              Icon: UserRound,
            },
          ];

  const productHome =
    product === "EDU" || product === "ADMIN" ? "/edu" : "/contest/contests";
  const displayName = user.firstName || user.username;
  const isActive = (path: string) =>
    path === "/edu"
      ? currentPath === "/edu"
      : currentPath === path || currentPath.startsWith(`${path}/`);

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

  return (
    <div ref={shellRef} className="mobile-app-shell flex min-h-[100dvh] flex-col bg-bg-base text-text-primary">
      <a className="skip-link" href="#main-content">{uk ? "Перейти до основного вмісту" : "Skip to main content"}</a>
      <DialogA11yObserver rootRef={shellRef} />
      <header data-material="premium-header" className="sticky top-0 z-50 border-b border-border/50 bg-bg-base/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] w-full max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={() => !navigationHidden && onNavigate(productHome)}
            className="flex items-center gap-2.5"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#173423]">
              <Logo size={19} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em]">
              StudyCod{" "}
              <span className="text-primary-strong dark:text-primary-soft">
                {product}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              data-motion-press
              className="grid size-9 max-md:size-11 place-items-center rounded-xl text-text-muted transition motion-safe:active:scale-[.97] hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-bg-surface/[.07]"
              aria-label={theme === "dark" ? (uk ? "Перемкнути на світлу тему" : "Switch to light theme") : (uk ? "Перемкнути на темну тему" : "Switch to dark theme")}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            {!navigationHidden && (
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
                  className="flex h-10 max-w-[320px] items-center gap-2 rounded-xl bg-primary/10 px-2 text-sm font-semibold text-primary-strong transition motion-safe:active:scale-[.97] dark:bg-primary/10 dark:text-primary-soft"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label={uk ? `Відкрити меню акаунта ${displayName}` : `Open account menu for ${displayName}`}
                  title={`${displayName} · @${user.username}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-strong text-xs text-primary-foreground">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 max-w-[220px] truncate sm:block lg:max-w-[260px]">
                    {displayName}
                  </span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {accountOpen && (
                  <div
                    ref={accountMenuRef}
                    data-material="account-menu"
                    data-motion-surface
                    className="material-popover absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-border/70 bg-bg-surface p-1 opacity-100 shadow-[var(--ui-modal-shadow)] transition max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] max-sm:top-auto max-sm:w-auto max-sm:rounded-3xl max-sm:p-3"
                    role="menu"
                    aria-label={uk ? "Меню акаунта" : "Account menu"}
                    onKeyDown={(event) => {
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
                    }}
                  >
                    <div className="px-3 py-2">
                      <div className="break-words text-sm font-semibold text-text-primary dark:text-text-primary">
                        {displayName}
                      </div>
                      <div className="mt-0.5 break-all text-xs text-[#6b7a70] dark:text-text-secondary">
                        @{user.username}
                      </div>
                    </div>
                    {product === "EDU" &&
                    onEduContextChange &&
                    (user.eduContexts?.students?.length ||
                      user.eduContexts?.organizations?.length) ? (
                      <div className="border-y border-border/10 px-2 py-2 dark:border-white/10">
                        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#718075] dark:text-text-secondary">
                          {uk ? "Контекст EDU" : "EDU context"}
                        </div>
                        {user.eduContexts?.organizations?.some((org) =>
                          ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(
                            org.role,
                          ),
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              setAccountOpen(false);
                              void onEduContextChange(null);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${!user.studentId ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "text-text-secondary hover:bg-bg-hover dark:hover:bg-bg-hover"}`}
                            role="menuitem"
                          >
                            <GraduationCap className="size-4" />
                            {uk ? "Викладач / команда" : "Teacher / staff"}
                          </button>
                        )}
                        {user.eduContexts?.students?.map((student) => (
                          <button
                            key={student.studentId}
                            type="button"
                            onClick={() => {
                              setAccountOpen(false);
                              void onEduContextChange(student.studentId);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${user.studentId === student.studentId ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "text-text-secondary hover:bg-bg-hover dark:hover:bg-bg-hover"}`}
                            role="menuitem"
                          >
                            <BookOpen className="size-4" />
                            <span className="min-w-0 truncate">
                              {uk ? "Учень" : "Student"}: {student.className}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!isContestOnly && <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          onNavigate(product === "EDU" ? "/edu/profile" : "/profile");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:bg-bg-hover dark:hover:bg-bg-hover"
                        role="menuitem"
                      >
                        <UserRound className="size-4" />
                        {uk ? "Профіль" : "Profile"}
                      </button>}
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        void onLogout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d84d71] hover:bg-[#fff1f4] dark:text-[#ff94b7] dark:hover:bg-[#ff6b9d]/10"
                      role="menuitem"
                    >
                      <LogOut className="size-4" />
                      {uk ? "Вийти" : "Sign out"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {!navigationHidden && <aside data-material="workspace-rail" className="fixed bottom-0 left-0 top-[72px] z-40 hidden w-[68px] flex-col border-r border-border/70 bg-bg-surface/90 py-4 backdrop-blur-xl lg:flex xl:w-[236px]" aria-label={uk ? "Розділи StudyCod" : "StudyCod sections"}>
        <div className="workspace-rail-heading hidden px-6 pb-3 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-text-muted xl:block">{uk ? "Розділи" : "Workspace"}</div>
        <nav className="flex flex-col gap-1 overflow-y-auto px-2 xl:px-3" aria-label={uk ? "Навігація модуля" : "Module navigation"}>
          {nav.map(({ label, path, Icon }) => <button key={path} type="button" onClick={() => onNavigate(path)} aria-current={isActive(path) ? "page" : undefined} title={label} className={`group relative flex h-12 items-center justify-center gap-3 rounded-xl px-2 text-sm font-semibold transition xl:justify-start xl:px-3 ${isActive(path) ? "bg-primary/12 text-primary-strong dark:bg-primary/14 dark:text-primary-soft" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:text-text-primary"}`}>
            {isActive(path) ? <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary" /> : null}
            <Icon className="size-[18px] shrink-0" />
            <span className="hidden truncate xl:inline">{label}</span>
          </button>)}
        </nav>
        <div className="mt-auto hidden px-6 pb-2 text-xs leading-5 text-text-muted xl:block"><span className="block font-semibold text-text-secondary">StudyCod {product}</span><span>{uk ? "Навчайся через практику" : "Learn by building"}</span></div>
      </aside>}
      <div className={`min-w-0 flex-1 ${navigationHidden ? "" : "lg:ml-[68px] xl:ml-[236px]"}`}>
      <div data-material="workspace-canvas" className="mobile-app-viewport min-h-[calc(100dvh-72px)] pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      {!navigationHidden && !isContestOnly && <PlatformFooter />}
      </div>
      {!navigationHidden && (
        <nav
          data-material="premium-mobile-nav"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-bg-base/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
          aria-label={uk ? "Мобільна навігація" : "Mobile navigation"}
        >
          <div className="flex gap-1 overflow-x-auto">
            {nav.map(({ label, path, Icon }) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                aria-current={isActive(path) ? "page" : undefined}
                data-motion-press
                className={`flex min-h-12 min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition motion-safe:active:scale-[.97] ${isActive(path) ? "bg-primary-strong text-primary-foreground dark:bg-primary/12 dark:text-primary-soft" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-bg-surface/[.07] dark:hover:text-white"}`}
              >
                <Icon className="size-4" />
                <span className="max-w-full truncate leading-none">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};
