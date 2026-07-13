import React from "react";
import { BookOpen, CalendarDays, ChevronDown, GraduationCap, LogOut, Moon, Sun, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo";
import { PlatformFooter } from "./PlatformFooter";
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
  children,
}) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const isTeacher = product === "EDU" && !user.studentId;

  const nav = product === "EDU"
    ? isTeacher
      ? [
          { label: uk ? "Класи" : "Classes", path: "/edu", Icon: GraduationCap },
          { label: uk ? "Календар" : "Calendar", path: "/edu/calendar", Icon: CalendarDays },
          { label: uk ? "Курси" : "Courses", path: "/edu/courses", Icon: BookOpen },
          { label: uk ? "Команда" : "Team", path: "/edu/organization", Icon: Users },
          { label: uk ? "Профіль" : "Profile", path: "/edu/profile", Icon: UserRound },
        ]
      : [
          { label: uk ? "Уроки" : "Lessons", path: "/edu/lessons", Icon: BookOpen },
          { label: uk ? "Журнал" : "Journal", path: "/edu/journal", Icon: GraduationCap },
          { label: uk ? "Календар" : "Calendar", path: "/edu/calendar", Icon: CalendarDays },
          { label: uk ? "Бібліотека" : "Library", path: "/edu/library", Icon: BookOpen },
          { label: uk ? "Профіль" : "Profile", path: "/edu/profile", Icon: UserRound },
        ]
    : [
        { label: uk ? "Контести" : "Contests", path: "/contest/contests", Icon: GraduationCap },
        { label: uk ? "Профіль" : "Profile", path: "/profile", Icon: UserRound },
      ];

  const productHome = product === "EDU" ? "/edu" : "/contest/contests";
  const displayName = user.firstName || user.username;
  const isActive = (path: string) => path === "/edu" ? currentPath === "/edu" : currentPath === path || currentPath.startsWith(`${path}/`);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
      <header className="sticky top-0 z-50 border-b border-[#152219]/10 bg-[#f7f8f5]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b120e]/85">
        <div className="mx-auto flex h-[72px] w-full max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <button type="button" onClick={() => !navigationHidden && onNavigate(productHome)} className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#153321]"><Logo size={19} /></span>
            <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em]">StudyCod <span className="text-[#14804a] dark:text-[#72edb0]">{product}</span></span>
          </button>

          {!navigationHidden && (
            <nav className="hidden items-center gap-1 rounded-xl bg-[#edf1ed] p-1 dark:bg-white/[.055] md:flex">
              {nav.map(({ label, path, Icon }) => (
                <button
                  type="button"
                  key={path}
                  onClick={() => onNavigate(path)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${isActive(path) ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onToggleTheme} className="grid size-9 place-items-center rounded-xl text-[#637166] hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07]" aria-label={theme === "dark" ? "Light theme" : "Dark theme"}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {!navigationHidden && (
              <div className="group relative">
                <button type="button" className="flex h-10 max-w-[230px] items-center gap-2 rounded-xl bg-[#e7f6ec] px-2 text-sm font-semibold text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#17251c] text-xs text-[#72edb0]">{user.username.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden min-w-0 truncate sm:block">{displayName}</span>
                  <ChevronDown className="size-3.5 shrink-0" />
                </button>
                <div className="invisible absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl border border-[#152219]/10 bg-white p-1 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#172018]">
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-semibold text-[#142017] dark:text-[#edf3ef]">{displayName}</div>
                    <div className="truncate text-xs text-[#6b7a70] dark:text-[#a4b2a7]">@{user.username}</div>
                  </div>
                  <button type="button" onClick={() => onNavigate(product === "EDU" ? "/edu/profile" : "/profile")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#314037] hover:bg-[#f2f5f2] dark:text-[#dce8de] dark:hover:bg-white/[.06]">
                    <UserRound className="size-4" />
                    {uk ? "Профіль" : "Profile"}
                  </button>
                  <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d84d71] hover:bg-[#fff1f4] dark:text-[#ff94b7] dark:hover:bg-[#ff6b9d]/10">
                    <LogOut className="size-4" />
                    {uk ? "Вийти" : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {!navigationHidden && (
          <nav className="flex gap-1 overflow-x-auto border-t border-[#152219]/8 px-4 py-2 md:hidden dark:border-white/8">
            {nav.map(({ label, path }) => (
              <button type="button" key={path} onClick={() => onNavigate(path)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${isActive(path) ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#6b7a70] dark:text-[#a4b2a7]"}`}>
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      {!navigationHidden && <PlatformFooter />}
    </div>
  );
};
