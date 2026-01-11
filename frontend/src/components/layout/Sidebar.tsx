import React from "react";
import { LayoutDashboard, ListTodo, BarChart3, User2, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { User } from "../../types";
interface Props {
  current: "dashboard" | "tasks" | "grades" | "profile";
  onChange: (page: Props["current"]) => void;
  user: User;
  onLogout: () => void;
}
export const Sidebar: React.FC<Props> = ({
  current,
  onChange,
  user,
  onLogout
}) => {
  const {
    t
  } = useTranslation();
  const items: {
    id: Props["current"];
    label: string;
    icon: React.ReactNode;
  }[] = [{
    id: "dashboard",
    label: t("home"),
    icon: <LayoutDashboard className="w-4 h-4" />
  }, {
    id: "tasks",
    label: t("tasks"),
    icon: <ListTodo className="w-4 h-4" />
  }, {
    id: "grades",
    label: t("grades"),
    icon: <BarChart3 className="w-4 h-4" />
  }, {
    id: "profile",
    label: t("profile"),
    icon: <User2 className="w-4 h-4" />
  }];
  return <aside className="w-64 bg-bg-surface border-r border-border flex flex-col">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-bg-base font-bold">&lt;/&gt;</div>
        <div>
          <div className="font-mono text-sm text-text-primary">StudyCod</div>
          <div className="text-xs text-text-secondary">Web Edition</div>
        </div>
      </div>
      <nav className="flex-1 py-4 space-y-1">
        {items.map(item => <button key={item.id} onClick={() => onChange(item.id)} className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-mono transition-fast ${current === item.id ? "bg-bg-hover text-primary border-r-2 border-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
            {item.icon}
            <span>{item.label}</span>
          </button>)}
      </nav>
      <div className="border-t border-border p-4 flex items-center justify-between text-xs text-text-muted font-mono">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-bg-base text-sm font-bold">
            {user.username.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-text-primary text-xs">{user.username}</div>
            <div className="text-[10px] text-text-muted">
              {user.course === "JAVA" ? t("javaCourse") : t("pythonCourse")}
            </div>
          </div>
        </div>
        <button onClick={onLogout} className="text-accent-error hover:opacity-80 transition-fast">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>;
};