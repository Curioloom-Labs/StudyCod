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
  onLogout: () => void;
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
              label: uk ? "Контести" : "Contests",
              path: "/contest/contests",
              Icon: GraduationCap,
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
    <div ref={shellRef} className="mobile-app-shell flex min-h-[100dvh] flex-col bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
      <DialogA11yObserver rootRef={shellRef} />
      <header data-material="premium-header" className="sticky top-0 z-50 border-b border-[#152219]/10 bg-[#f7f8f5]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b120e]/85">
        <div className="mx-auto flex h-[72px] w-full max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={() => !navigationHidden && onNavigate(productHome)}
            className="flex items-center gap-2.5"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#153321]">
              <Logo size={19} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em]">
              StudyCod{" "}
              <span className="text-[#14804a] dark:text-[#72edb0]">
                {product}
              </span>
            </span>
          </button>

          {!navigationHidden && (
            <nav aria-label={uk ? "Навігація модуля" : "Module navigation"} className="hidden items-center gap-1 rounded-xl bg-[#edf1ed] p-1 dark:bg-white/[.055] md:flex">
              {nav.map(({ label, path, Icon }) => (
                <button
                  type="button"
                  key={path}
                  onClick={() => onNavigate(path)}
                  aria-current={isActive(path) ? "page" : undefined}
                  data-motion-press
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition motion-safe:active:scale-[.97] ${isActive(path) ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              data-motion-press
              className="grid size-9 place-items-center rounded-xl text-[#637166] transition motion-safe:active:scale-[.97] hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07]"
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
                  className="flex h-10 max-w-[320px] items-center gap-2 rounded-xl bg-[#e7f6ec] px-2 text-sm font-semibold text-[#147b47] transition motion-safe:active:scale-[.97] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label={uk ? `Відкрити меню акаунта ${displayName}` : `Open account menu for ${displayName}`}
                  title={`${displayName} · @${user.username}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#17251c] text-xs text-[#72edb0]">
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
                    className="material-popover absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-[#152219]/10 bg-white p-1 opacity-100 shadow-xl transition dark:border-white/10 dark:bg-[#172018] max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] max-sm:top-auto max-sm:w-auto max-sm:rounded-3xl max-sm:p-3"
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
                      <div className="break-words text-sm font-semibold text-[#142017] dark:text-[#edf3ef]">
                        {displayName}
                      </div>
                      <div className="mt-0.5 break-all text-xs text-[#6b7a70] dark:text-[#a4b2a7]">
                        @{user.username}
                      </div>
                    </div>
                    {product === "EDU" &&
                    onEduContextChange &&
                    (user.eduContexts?.students?.length ||
                      user.eduContexts?.organizations?.length) ? (
                      <div className="border-y border-[#152219]/10 px-2 py-2 dark:border-white/10">
                        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#718075] dark:text-[#a4b2a7]">
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
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${!user.studentId ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "text-[#314037] hover:bg-[#f2f5f2] dark:text-[#dce8de] dark:hover:bg-white/[.06]"}`}
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
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${user.studentId === student.studentId ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "text-[#314037] hover:bg-[#f2f5f2] dark:text-[#dce8de] dark:hover:bg-white/[.06]"}`}
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
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate(
                          product === "EDU" ? "/edu/profile" : "/profile",
                        );
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#314037] hover:bg-[#f2f5f2] dark:text-[#dce8de] dark:hover:bg-white/[.06]"
                      role="menuitem"
                    >
                      <UserRound className="size-4" />
                      {uk ? "Профіль" : "Profile"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onLogout();
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
      {!navigationHidden && (
        <nav
          data-material="premium-mobile-nav"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#152219]/10 bg-[#f7f8f5]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#0b120e]/95 md:hidden"
          aria-label={uk ? "Мобільна навігація" : "Mobile navigation"}
        >
          <div className="grid grid-cols-5 gap-1">
            {nav.slice(0, 5).map(({ label, path, Icon }) => (
              <button
                key={path}
                type="button"
                onClick={() => onNavigate(path)}
                aria-current={isActive(path) ? "page" : undefined}
                data-motion-press
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition motion-safe:active:scale-[.97] ${isActive(path) ? "bg-[#183524] text-white dark:bg-[#00ff88]/12 dark:text-[#72edb0]" : "text-[#637267] hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}
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
      <main className="mobile-app-viewport flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
      {!navigationHidden && <PlatformFooter />}
    </div>
  );
};
