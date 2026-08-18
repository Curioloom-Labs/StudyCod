import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCachedMeUser, getMe } from "../../lib/api/profile";
import { api } from "../../lib/api/client";
import type { User } from "../../types";
import { getCurrentTheme, applyTheme, type AppTheme } from "../../theme";
import { BrandedPageLoader } from "../ui/BrandedPageLoader";
import { PersonalLearningProvider } from "../learning/PersonalLearningProvider";
import { PremiumWorkspaceShell } from "./PremiumWorkspaceShell";

export const PersonalRouteShell: React.FC<{ children: React.ReactNode; area?: "learning" | "lab"; courseTab?: "overview" | "path" | "practice" | "progress" }> = ({ children, area = "learning", courseTab = "overview" }) => {
  const [user, setUser] = React.useState<User | null>(() => getCachedMeUser());
  const [loading, setLoading] = React.useState(() => !getCachedMeUser());
  const [loadError, setLoadError] = React.useState(false);
  const [theme, setTheme] = React.useState<AppTheme>(getCurrentTheme);
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  React.useEffect(() => {
    let active = true;
    void getMe({ suppressAuthRedirect: true })
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
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
  }, []);
  if (loading && !user) return <BrandedPageLoader />;
  if (!user || loadError && !user) {
    return <main className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <section role="alert" className="w-full max-w-md rounded-3xl border border-border bg-bg-surface p-7 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">StudyCod</p>
        <h1 className="mt-3 text-xl font-bold text-text-primary">Не вдалося відкрити навчальний простір</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">З’єднання з профілем перервано. Сторінка більше не зависатиме на нескінченному завантаженні.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Спробувати ще раз</button>
      </section>
    </main>;
  }
  const go = (page: string) => {
    if (page === "home") navigate("/");
    else if (page === "tasks") navigate("/lab/practice?workspace=personal");
    else if (page === "grades") navigate("/learning/catalog");
    else if (page === "admin") navigate("/?app=admin");
    else if (page === "profile") navigate("/?app=profile");
  };
  return <PersonalLearningProvider><PremiumWorkspaceShell user={user} page={area === "lab" ? "tasks" : "home"} area={area} courseTab={courseTab} theme={theme} onNavigate={go} onLibrary={() => navigate("/lab/library")} onCourses={() => navigate("/learning/catalog")} onPlayground={() => navigate("/lab/playground")} onToggleTheme={() => setTheme((prev) => { const next = prev === "dark" ? "light" : "dark"; applyTheme(next); return next; })} onToggleLanguage={() => void i18n.changeLanguage(i18n.language.startsWith("en") ? "uk" : "en")} onSupport={() => navigate("/support")} onSupportDesk={() => navigate("/support/desk")} onLogout={() => { void api.post("/auth/logout").finally(() => navigate("/")); }}>{children}</PremiumWorkspaceShell></PersonalLearningProvider>;
};
