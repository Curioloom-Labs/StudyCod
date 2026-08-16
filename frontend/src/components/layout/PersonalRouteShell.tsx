import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "../../lib/api/profile";
import { api } from "../../lib/api/client";
import type { User } from "../../types";
import { getCurrentTheme, applyTheme, type AppTheme } from "../../theme";
import { BrandedPageLoader } from "../ui/BrandedPageLoader";
import { PersonalLearningProvider } from "../learning/PersonalLearningProvider";
import { PremiumWorkspaceShell } from "./PremiumWorkspaceShell";

export const PersonalRouteShell: React.FC<{ children: React.ReactNode; area?: "learning" | "lab"; courseTab?: "overview" | "path" | "practice" | "progress" }> = ({ children, area = "learning", courseTab = "overview" }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [theme, setTheme] = React.useState<AppTheme>(getCurrentTheme);
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  React.useEffect(() => { void getMe({ suppressAuthRedirect: true }).then(setUser).catch(() => setUser(null)); }, []);
  if (!user) return <BrandedPageLoader />;
  const go = (page: string) => {
    if (page === "home") navigate("/");
    else if (page === "tasks") navigate("/lab/practice");
    else if (page === "grades") navigate("/learning/catalog");
    else if (page === "admin") navigate("/?app=admin");
    else if (page === "profile") navigate("/?app=profile");
  };
  return <PersonalLearningProvider><PremiumWorkspaceShell user={user} page={area === "lab" ? "tasks" : "home"} area={area} courseTab={courseTab} theme={theme} onNavigate={go} onLibrary={() => navigate("/lab/library")} onCourses={() => navigate("/learning/catalog")} onPlayground={() => navigate("/lab/playground")} onToggleTheme={() => setTheme((prev) => { const next = prev === "dark" ? "light" : "dark"; applyTheme(next); return next; })} onToggleLanguage={() => void i18n.changeLanguage(i18n.language.startsWith("en") ? "uk" : "en")} onSupport={() => navigate("/support")} onSupportDesk={() => navigate("/support/desk")} onLogout={() => { void api.post("/auth/logout").finally(() => navigate("/")); }}>{children}</PremiumWorkspaceShell></PersonalLearningProvider>;
};
