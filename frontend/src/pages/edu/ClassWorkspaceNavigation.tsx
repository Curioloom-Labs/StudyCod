import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, LayoutDashboard, UsersRound } from "lucide-react";
import { tr } from "../../i18n";
import { withDevPreview } from "../../lib/devPreview";
import "./classVisualQuality.css";

export type ClassWorkspaceSection = "overview" | "students" | "learning" | "gradebook" | "calendar";

type Props = {
  classId: number | string;
  className?: string;
  active: ClassWorkspaceSection;
  backHref?: string;
  backLabel?: string;
  reduceMotion?: boolean | null;
};

export const ClassWorkspaceNavigation: React.FC<Props> = ({
  classId,
  className = tr("Клас", "Class"),
  active,
  backHref = `/edu/classes/${classId}`,
  backLabel = tr("До класу", "Back to class"),
  reduceMotion = false,
}) => {
  const navigate = useNavigate();
  const classPath = `/edu/classes/${classId}`;
  const items: Array<{ id: ClassWorkspaceSection; label: string; icon: React.ComponentType<{ className?: string }>; href: string }> = [
    { id: "overview", label: tr("Огляд", "Overview"), icon: LayoutDashboard, href: classPath },
    { id: "students", label: tr("Учні", "Students"), icon: UsersRound, href: `${classPath}/manage` },
    { id: "learning", label: tr("Навчання", "Learning"), icon: BookOpen, href: `${classPath}#class-topics` },
    { id: "gradebook", label: tr("Журнал", "Gradebook"), icon: ClipboardList, href: `${classPath}/gradebook` },
    { id: "calendar", label: tr("Календар", "Calendar"), icon: CalendarDays, href: "/edu/calendar" },
  ];

  return (
    <div className="class-workspace-nav">
      <div className="class-workspace-nav__context">
        <button type="button" onClick={() => navigate(withDevPreview(backHref))} className="class-workspace-nav__back">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>
        <span className="class-workspace-nav__divider" aria-hidden="true" />
        <span className="class-workspace-nav__label">{tr("Викладач", "Teacher")}</span>
        <span className="class-workspace-nav__slash" aria-hidden="true">/</span>
        <strong title={className}>{className}</strong>
      </div>
      <nav className="class-workspace-nav__tabs" aria-label={tr("Розділи класу", "Class sections")}>
        {items.map(({ id: section, label, icon: Icon, href }) => {
          const isActive = active === section;
          return (
            <button
              type="button"
              key={section}
              aria-current={isActive ? "page" : undefined}
              className="class-workspace-nav__tab"
              data-active={isActive || undefined}
              onClick={() => {
                if (section === "learning" && active === "overview") {
                  document.getElementById("class-topics")?.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
                  return;
                }
                navigate(withDevPreview(href));
              }}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default ClassWorkspaceNavigation;
