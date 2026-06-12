import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HelpCircle, SunMoon } from "lucide-react";
import type { User } from "../../types";
import { getMe } from "../../lib/api/profile";
import { Logo } from "../Logo";
import { useUIMode } from "../interface/UIModeProvider";
import { MomentumShell, type MomentumNavTarget } from "../../layout/momentum/MomentumShell";
import { NovaShellLazy } from "../../layout/nova/NovaShellLazy";
import { PageSkeleton } from "../ui/Skeleton";
import { applyTheme, getCurrentTheme, type AppTheme } from "../../theme";

type Props = {
  current: MomentumNavTarget;
  children: React.ReactNode;
};

// The shell remounts on every route change; resolving the user synchronously
// from this session cache avoids a skeleton flash (and visible "nav reload")
// on each navigation between standalone pages.
let sessionUser: { token: string; user: User } | null = null;

const readToken = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

// Wraps standalone routes (/library, /playground, /learn, /contests, ...) in the
// user's active shell so navigation stays available outside the main app tree.
// Guests and CONTEST-mode users get the page bare — their flows have their own chrome.
export const StandaloneShell: React.FC<Props> = ({ current, children }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ui = useUIMode();
  const token = readToken();
  const hasToken = !!token;
  const [user, setUser] = React.useState<User | null>(() =>
    token && sessionUser?.token === token ? sessionUser.user : null
  );
  const [loading, setLoading] = React.useState(hasToken && !user);
  const [theme, setTheme] = React.useState<AppTheme>(() => getCurrentTheme());

  React.useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    getMe()
      .then(u => {
        if (token) sessionUser = { token, user: u };
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Auth failure: fall through to the bare page; route guards handle redirects.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken, token]);

  const toggleTheme = React.useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  if (!hasToken) {
    return <>{children}</>;
  }
  if (loading) {
    return <div className="min-h-[100dvh] bg-bg-base text-text-primary">
        <PageSkeleton />
      </div>;
  }
  if (!user || user.userMode === "CONTEST") {
    return <>{children}</>;
  }

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);

  const onNavigate = (target: MomentumNavTarget) => {
    switch (target) {
      case "library":
        navigate(isEducational && isStudent ? "/edu/library" : "/library");
        return;
      case "support":
        navigate("/support");
        return;
      case "contests":
        navigate("/contests");
        return;
      case "playground":
        navigate("/playground");
        return;
      case "learn":
        navigate("/learn");
        return;
      case "lessons":
        navigate("/edu/lessons");
        return;
      case "student":
        navigate("/edu/journal");
        return;
      case "teacher":
        navigate("/edu");
        return;
      case "continue":
        navigate(isEducational ? (isStudent ? "/edu/lessons" : "/edu") : "/");
        return;
      default:
        // tasks / grades / profile / admin live inside AppContent.
        navigate(`/?app=${target}`);
        return;
    }
  };

  const onLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  if (ui.mode === "classic") {
    return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
        <header className="min-h-14 border-b border-border bg-bg-surface flex items-center justify-between px-4 md:px-6 py-2 gap-2 flex-shrink-0">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-fast" aria-label={t("toHome")}>
            <Logo size={24} className="text-primary" />
            <span className="text-lg font-mono text-text-primary">StudyCod</span>
          </button>
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <button onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="shrink-0 px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")} aria-label={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}>
              {i18n.language === "uk" ? "EN" : "UA"}
            </button>
            <button onClick={toggleTheme} className="shrink-0 px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")} aria-label={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button onClick={() => navigate("/docs")} className="shrink-0 px-3 py-1.5 border border-border text-sm font-mono hover:bg-bg-hover transition-fast flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{t("help")}</span>
            </button>
            <button onClick={() => navigate("/")} className="shrink-0 px-3 py-1.5 border border-border text-sm font-mono hover:bg-bg-hover transition-fast">
              {t("toHome")}
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>;
  }

  const Shell = ui.mode === "nova" ? NovaShellLazy : MomentumShell;
  return <React.Suspense fallback={<div className="min-h-[100dvh] bg-bg-base text-text-primary"><PageSkeleton /></div>}>
      <Shell user={user} current={current} onNavigate={onNavigate} onLogout={onLogout} topRight={<button onClick={toggleTheme} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")} aria-label={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
        <SunMoon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
      </button>}>
      {children}
    </Shell>
    </React.Suspense>;
};
