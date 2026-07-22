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
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);

  const nav = product === "EDU"
    ? isTeacher
      ? [
          { label: uk ? "Класи" : "Classes", path: "/edu", Icon: GraduationCap },
          { label: uk ? "Календар" : "Calendar", path: "/edu/calendar", Icon: CalendarDays },
          { label: uk ? "Курси" : "Courses", path: "/edu/courses", Icon: BookOpen },
          { label: uk ? "Бібліотека" : "Library", path: "/edu/library", Icon: BookOpen },
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

  return (
    <div className="mobile-app-shell flex min-h-[100dvh] flex-col bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
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
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  className="flex h-10 max-w-[320px] items-center gap-2 rounded-xl bg-[#e7f6ec] px-2 text-sm font-semibold text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  title={`${displayName} · @${user.username}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#17251c] text-xs text-[#72edb0]">{user.username.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden min-w-0 max-w-[220px] truncate sm:block lg:max-w-[260px]">{displayName}</span>
                  <ChevronDown className={`size-3.5 shrink-0 transition ${accountOpen ? "rotate-180" : ""}`} />
                </button>
                {accountOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-[#152219]/10 bg-white p-1 opacity-100 shadow-xl transition dark:border-white/10 dark:bg-[#172018] max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] max-sm:top-auto max-sm:w-auto max-sm:rounded-3xl max-sm:p-3" role="menu">
                  <div className="px-3 py-2">
                    <div className="break-words text-sm font-semibold text-[#142017] dark:text-[#edf3ef]">{displayName}</div>
                    <div className="mt-0.5 break-all text-xs text-[#6b7a70] dark:text-[#a4b2a7]">@{user.username}</div>
                  </div>
                  <button type="button" onClick={() => { setAccountOpen(false); onNavigate(product === "EDU" ? "/edu/profile" : "/profile"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#314037] hover:bg-[#f2f5f2] dark:text-[#dce8de] dark:hover:bg-white/[.06]" role="menuitem">
                    <UserRound className="size-4" />
                    {uk ? "Профіль" : "Profile"}
                  </button>
                  <button type="button" onClick={() => { setAccountOpen(false); onLogout(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d84d71] hover:bg-[#fff1f4] dark:text-[#ff94b7] dark:hover:bg-[#ff6b9d]/10" role="menuitem">
                    <LogOut className="size-4" />
                    {uk ? "Вийти" : "Sign out"}
                  </button>
                </div>}
              </div>
            )}
          </div>
        </div>

      </header>
      {!navigationHidden && <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#152219]/10 bg-[#f7f8f5]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#0b120e]/95 md:hidden" aria-label={uk ? "Мобільна навігація" : "Mobile navigation"}>
        <div className="grid grid-cols-5 gap-1">
          {nav.slice(0, 5).map(({ label, path, Icon }) => (
            <button key={path} type="button" onClick={() => onNavigate(path)} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${isActive(path) ? "bg-[#183524] text-white dark:bg-[#00ff88]/12 dark:text-[#72edb0]" : "text-[#637267] hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>
              <Icon className="size-4" />
              <span className="max-w-full truncate leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>}
      <main className="mobile-app-viewport flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      {!navigationHidden && <PlatformFooter />}
    </div>
  );
};
