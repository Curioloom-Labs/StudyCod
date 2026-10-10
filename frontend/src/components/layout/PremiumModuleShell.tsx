import React from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  Languages,
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
import { WorkspaceTopNavigation } from "./WorkspaceTopNavigation";
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
  const isParent = product === "EDU" && user.role === "USER" && currentPath.startsWith("/edu/parent");
  const isTeacher = product === "EDU" && !user.studentId && user.role !== "USER";
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
        ? isParent
          ? [
              { label: uk ? "Прогрес дитини" : "Child progress", path: "/edu/parent", Icon: GraduationCap },
              { label: uk ? "Профіль" : "Profile", path: "/edu/profile", Icon: UserRound },
            ]
          : isTeacher
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
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-16 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => !navigationHidden && onNavigate(productHome)}
            className="flex min-h-11 items-center gap-2.5"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-[#173423] sm:size-9">
              <Logo size={19} />
            </span>
            <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-sm font-bold tracking-[-.04em] max-[359px]:hidden sm:text-lg">
              StudyCod{" "}
              <span className="text-primary-strong dark:text-primary-soft max-md:hidden">
                {product}
              </span>
            </span>
          </button>

          {!navigationHidden ? <WorkspaceTopNavigation
            label={product === "EDU" ? (uk ? "Навігація навчального простору" : "Learning workspace navigation") : product === "CONTEST" ? (uk ? "Навігація контестів" : "Contest navigation") : (uk ? "Адміністративна навігація" : "Administration navigation")}
            closeLabel={uk ? "Закрити навігацію" : "Close navigation"}
            items={nav.map(({ label, path, Icon }) => ({
              label,
              Icon,
              active: isActive(path),
              onSelect: () => onNavigate(path),
            }))}
          /> : null}

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
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(uk ? "en" : "uk")}
              className="grid size-9 max-md:size-11 place-items-center rounded-xl px-1.5 text-xs font-semibold text-text-muted transition hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-bg-surface/[.07]"
              aria-label={uk ? "Перемкнути на англійську" : "Switch to Ukrainian"}
              title={uk ? "English" : "Українська"}
            >
              <Languages className="size-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{uk ? "EN" : "UA"}</span>
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
                  className="flex h-10 max-w-[320px] items-center gap-2 rounded-xl bg-primary/10 px-2 text-sm font-semibold text-primary-strong transition motion-safe:active:scale-[.97] dark:bg-primary/10 dark:text-primary-soft max-md:size-11 max-md:justify-center max-md:px-0"
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
                    className={`size-3.5 shrink-0 transition max-md:hidden ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {accountOpen && (
                  <div
                    ref={accountMenuRef}
                    data-material="account-menu"
                    data-motion-surface
                    className="material-popover absolute right-0 top-[calc(100%+8px)] z-50 w-72 max-w-[calc(100vw-1.25rem)] rounded-xl border border-border/70 bg-bg-surface p-1 opacity-100 shadow-[var(--ui-modal-shadow)] transition"
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
      <div className="min-w-0 flex-1">
      <div data-material="workspace-canvas" className="mobile-app-viewport min-h-[calc(100dvh-56px)] sm:min-h-[calc(100dvh-64px)]">
        {children}
      </div>
      {!navigationHidden && !isContestOnly && <PlatformFooter />}
      </div>
    </div>
  );
};
