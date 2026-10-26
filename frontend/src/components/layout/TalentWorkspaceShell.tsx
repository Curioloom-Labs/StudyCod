import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { Logo } from "../Logo";
import { NotificationsBell } from "../blog/NotificationsBell";
import { getCachedMeUser, getMe } from "../../lib/api/profile";
import { applyTheme, getCurrentTheme } from "../../theme";
import { withDevPreview } from "../../lib/devPreview";
import "../../pages/projects/talentWorkspace.css";

export const TalentWorkspaceShell: React.FC<{ children: React.ReactNode; context: React.ReactNode; navigation: React.ReactNode }> = ({ children, context, navigation }) => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [user, setUser] = React.useState(getCachedMeUser);
  const [theme, setTheme] = React.useState(getCurrentTheme);
  React.useEffect(() => {
    let active = true;
    if (!user) void getMe({ suppressAuthRedirect: true }).then(next => { if (active) setUser(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);
  return <div className="talent-workspace">
    <a className="skip-link" href="#main-content">{en ? "Skip to workspace" : "До робочого простору"}</a>
    <header className="talent-masthead">
      <div className="talent-masthead__inner">
        <Link to={withDevPreview("/companies")} className="talent-brand" aria-label="StudyCod Talent">
          <span className="talent-brand__mark"><Logo size={21} /></span>
          <span className="talent-brand__name">StudyCod <strong>Talent</strong></span>
        </Link>
        <div className="talent-masthead__tools">
          <Link to={withDevPreview("/")} className="talent-learning-link">{en ? "Learning space" : "Навчальний простір"}<ArrowUpRight size={14} /></Link>
          <button className="talent-icon-button" type="button" onClick={() => setTheme(previous => { const next = previous === "dark" ? "light" : "dark"; applyTheme(next); return next; })} aria-label={en ? "Change theme" : "Змінити тему"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button className="talent-icon-button talent-language" type="button" onClick={() => void i18n.changeLanguage(en ? "uk" : "en")} aria-label={en ? "Switch to Ukrainian" : "Switch to English"}>{en ? "UA" : "EN"}</button>
          <NotificationsBell />
          <Link to={withDevPreview("/?app=profile")} className="talent-avatar" aria-label={en ? "Your profile" : "Твій профіль"}>{(user?.firstName || user?.username || "S").slice(0, 1).toUpperCase()}</Link>
        </div>
      </div>
    </header>
    <div className="talent-context-bar"><div className="talent-context-bar__inner">{context}</div></div>
    <div className="talent-nav-wrap">{navigation}</div>
    {children}
    <footer className="talent-footer"><span>StudyCod Talent</span><div><Link to="/privacy">{en ? "Privacy" : "Приватність"}</Link><Link to="/terms">{en ? "Terms" : "Умови"}</Link><Link to="/support">{en ? "Support" : "Підтримка"}</Link></div></footer>
  </div>;
};
