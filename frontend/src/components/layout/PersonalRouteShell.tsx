import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCachedMeUser, getMe } from "../../lib/api/profile";
import { api } from "../../lib/api/client";
import type { User } from "../../types";
import { getCurrentTheme, applyTheme, type AppTheme } from "../../theme";
import { PageLoader } from "../ui/PageLoadingTransition";
import { PersonalLearningProvider } from "../learning/PersonalLearningProvider";
import { PremiumWorkspaceShell } from "./PremiumWorkspaceShell";
import { PersonalWorkspaceContext } from "./PersonalWorkspaceContext";
import { getDevPreviewUser, isDevPreviewActive, withDevPreview } from "../../lib/devPreview";

export const PersonalRouteShell: React.FC<{ children: React.ReactNode; area?: "learning" | "lab"; courseTab?: "overview" | "path" | "practice" | "progress" }> = ({ children, area = "learning", courseTab = "overview" }) => {
  const sharedWorkspace = useContext(PersonalWorkspaceContext);
  const [user, setUser] = React.useState<User | null>(() => getCachedMeUser() ?? (isDevPreviewActive() ? getDevPreviewUser() : null));
  const [loading, setLoading] = React.useState(() => !getCachedMeUser());
  const [loadError, setLoadError] = React.useState(false);
  const [theme, setTheme] = React.useState<AppTheme>(getCurrentTheme);
  const navigate = useNavigate();
  const navigateWithPreview = (path: string) => navigate(withDevPreview(path));
  const { i18n } = useTranslation();
  React.useEffect(() => {
    if (sharedWorkspace?.active) return;
    let active = true;
    void getMe({ suppressAuthRedirect: true })
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        sharedWorkspace?.setUser(nextUser);
        setLoadError(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [sharedWorkspace?.active, sharedWorkspace?.setUser]);
  if (sharedWorkspace?.active) return <>{children}</>;
  if (loading && !user) return <PageLoader />;
  if (!user || loadError && !user) {
    return <main id="main-content" tabIndex={-1} className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <section role="alert" className="w-full max-w-md rounded-3xl border border-border bg-bg-surface p-7 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">StudyCod</p>
        <h1 className="mt-3 text-xl font-bold text-text-primary">Не вдалося відкрити навчальний простір</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">З’єднання з профілем перервано. Сторінка більше не зависатиме на нескінченному завантаженні.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Спробувати ще раз</button>
      </section>
    </main>;
  }
  const go = (page: string) => {
    if (page === "home") navigateWithPreview("/");
    else if (page === "tasks") navigateWithPreview("/lab/practice?workspace=personal");
    else if (page === "grades") navigateWithPreview("/learning/catalog");
    else if (page === "admin") navigateWithPreview("/?app=admin");
    else if (page === "profile") navigateWithPreview("/?app=profile");
  };
  return <PersonalLearningProvider><PremiumWorkspaceShell user={user} page={area === "lab" ? "tasks" : "home"} area={area} courseTab={courseTab} theme={theme} onNavigate={go} onLibrary={() => navigateWithPreview("/lab/library")} onCourses={() => navigateWithPreview("/learning/catalog")} onPlayground={() => navigateWithPreview("/lab/playground")} onToggleTheme={() => setTheme((prev) => { const next = prev === "dark" ? "light" : "dark"; applyTheme(next); return next; })} onToggleLanguage={() => void i18n.changeLanguage(i18n.language.startsWith("en") ? "uk" : "en")} onSupport={() => navigateWithPreview("/support")} onSupportDesk={() => navigateWithPreview("/support/desk")} onLogout={() => { if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true") { navigate("/", { replace: true }); return; } void api.post("/auth/logout").finally(() => navigate("/")); }}>{children}</PremiumWorkspaceShell></PersonalLearningProvider>;
};
