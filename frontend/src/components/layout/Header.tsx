import React from "react";
import { User as UserIcon, List, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo";
import type { User } from "../../types";
interface Props {
  user: User;
  currentPage: "home" | "tasks" | "grades" | "profile";
  onNavigate: (page: "home" | "tasks" | "grades" | "profile") => void;
}
export const Header: React.FC<Props> = ({
  user,
  currentPage,
  onNavigate
}) => {
  const {
    t
  } = useTranslation();
  return <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={() => onNavigate("home")} className="flex items-center gap-2 hover:opacity-80 transition-fast">
          <Logo size={24} />
          <span className="text-lg font-mono text-text-primary">StudyCod</span>
        </button>
        <div className="h-6 w-px bg-border" />
        <div className="px-3 py-1 border border-secondary/40 bg-secondary/10 text-sm font-mono text-secondary">
          {(user.activeRuntime || "PYTHON") === "JAVA" ? "Java" : (user.activeRuntime || "PYTHON") === "PYTHON" ? "Python" : "C++"}
        </div>
      </div>
      
      <nav className="flex items-center gap-1">
        <button onClick={() => onNavigate("tasks")} className={`w-11 h-11 border flex items-center justify-center transition-fast ${currentPage === "tasks" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50 hover:text-text-primary"}`} title={t("tasks")} aria-label={t("tasks")}>
          <List className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate("grades")} className={`w-11 h-11 border flex items-center justify-center transition-fast ${currentPage === "grades" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50 hover:text-text-primary"}`} title={t("grades")} aria-label={t("grades")}>
          <FileText className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate("profile")} className={`w-11 h-11 border flex items-center justify-center transition-fast ${currentPage === "profile" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50 hover:text-text-primary"}`} title={t("profile")} aria-label={t("profile")}>
          <UserIcon className="w-4 h-4" />
        </button>
      </nav>
    </header>;
};
