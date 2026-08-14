import React from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Code2,
  HelpCircle,
  Home,
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

type Page = "home" | "tasks" | "grades" | "plan" | "profile" | "teacher" | "student" | "admin";

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
}) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);

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

  const nav: Array<{ id: Page; label: string; Icon: React.ElementType<{ className?: string }> }> = [
    { id: "home", label: uk ? "Огляд" : "Overview", Icon: Home },
    { id: "tasks", label: uk ? "Практика" : "Practice", Icon: Code2 },
    { id: "grades", label: uk ? "Прогрес" : "Progress", Icon: Trophy },
    ...(user.role === "SYSTEM_ADMIN"
      ? [{ id: "admin" as const, label: uk ? "Адміністрування" : "Admin", Icon: ShieldCheck }]
      : []),
  ];

  const active = (id: Page) => page === id;
  const routeIsActive = (path: string) => window.location.pathname === path || window.location.pathname.startsWith(`${path}/`);
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
    else window.location.assign("/support");
  };
  const goSupportDesk = () => {
    if (onSupportDesk) onSupportDesk();
    else window.location.assign("/support/desk");
  };
  const hasSupportDesk = user.role === "SUPPORT" || user.role === "SYSTEM_ADMIN";

  return (
    <div className="mobile-app-shell flex min-h-[100dvh] flex-col bg-[#f7f8f5] text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef]">
      <header className="sticky top-0 z-50 border-b border-[#152219]/10 bg-[#f7f8f5]/82 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b120e]/82">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-10">
          <button type="button" onClick={() => onNavigate("home")} className="flex shrink-0 items-center gap-2.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#153321]">
              <Logo size={19} />
            </span>
            <span className="hidden font-[family-name:var(--font-display)] text-lg font-bold tracking-[-.04em] xl:inline">StudyCod</span>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto rounded-xl bg-[#edf1ed] p-1 whitespace-nowrap dark:bg-white/[.055] lg:flex" aria-label={uk ? "Основна навігація" : "Primary navigation"}>
            {nav.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${
                  active(id)
                    ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]"
                    : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button type="button" onClick={onLibrary} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${routeIsActive("/library") ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}>
              <BookOpen className="h-4 w-4" />
              {uk ? "Бібліотека" : "Library"}
            </button>
            <button type="button" onClick={onCourses} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${routeIsActive("/learning") ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}>
              <BookOpen className="h-4 w-4" />
              {uk ? "Курси" : "Courses"}
            </button>
            <button type="button" onClick={onPlayground} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${routeIsActive("/playground") ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}>
              <PlaySquare className="h-4 w-4" />
              {uk ? "Пісочниця" : "Playground"}
            </button>
            {hasSupportDesk ? <button type="button" onClick={goSupportDesk} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition xl:px-3.5 xl:text-sm ${routeIsActive("/support/desk") ? "bg-white text-[#152219] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#657368] hover:text-[#142017] dark:text-[#a4b2a7] dark:hover:text-[#edf3ef]"}`}>
              <HelpCircle className="h-4 w-4" />
              Support desk
            </button> : null}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={onToggleTheme} className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07]">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === "dark" ? (uk ? "Світла" : "Light") : (uk ? "Темна" : "Dark")}</span>
            </button>
            <button type="button" onClick={onToggleLanguage} className="hidden h-9 rounded-xl px-2.5 text-xs font-semibold text-[#637166] transition hover:bg-[#e9eeea] dark:text-[#a6b5aa] dark:hover:bg-white/[.07] sm:block">
              {uk ? "EN" : "UA"}
            </button>

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#152219]/10 bg-[#f7f8f5]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#0b120e]/95 lg:hidden" aria-label={uk ? "Мобільна навігація" : "Mobile navigation"}>
        <div className="grid grid-cols-6 gap-1">
          {[
            { id: "home" as const, label: nav.find((item) => item.id === "home")?.label ?? "Home", Icon: Home, onClick: () => onNavigate("home") },
            { id: "tasks" as const, label: nav.find((item) => item.id === "tasks")?.label ?? "Practice", Icon: Code2, onClick: () => onNavigate("tasks") },
            { id: "grades" as const, label: nav.find((item) => item.id === "grades")?.label ?? "Progress", Icon: Trophy, onClick: () => onNavigate("grades") },
            { id: "library" as const, label: uk ? "Бібліотека" : "Library", Icon: BookOpen, onClick: onLibrary },
            { id: "playground" as const, label: uk ? "Пісочниця" : "Playground", Icon: PlaySquare, onClick: onPlayground },
            { id: "courses" as const, label: uk ? "Курси" : "Courses", Icon: BookOpen, onClick: onCourses },
          ].map(({ id, label, Icon, onClick }) => (
            <button key={id} type="button" onClick={onClick} aria-current={active(id as Page) ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${active(id as Page) ? "bg-[#183524] text-white dark:bg-[#00ff88]/12 dark:text-[#72edb0]" : "text-[#637267] hover:bg-[#e9efea] hover:text-[#17231b] dark:text-[#aab7ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>
              <Icon className="size-4" />
              <span className="max-w-full truncate leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <main className="mobile-app-viewport flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <PlatformFooter />
    </div>
  );
};
