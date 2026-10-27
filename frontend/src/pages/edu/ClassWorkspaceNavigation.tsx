import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, LayoutDashboard, UsersRound, GraduationCap } from "lucide-react";
import { tr } from "../../i18n";
import { withDevPreview } from "../../lib/devPreview";
import "./classVisualQuality.css";
import "./classroomWorkspace.css";

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
    { id: "learning", label: tr("Теми та завдання", "Topics and tasks"), icon: BookOpen, href: `${classPath}?view=learning` },
    { id: "gradebook", label: tr("Журнал", "Gradebook"), icon: ClipboardList, href: `${classPath}/gradebook` },
    { id: "calendar", label: tr("Календар", "Calendar"), icon: CalendarDays, href: `/edu/calendar?class=${classId}` },
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
              aria-label={label}
              className="class-workspace-nav__tab"
              data-active={isActive || undefined}
              onClick={() => {
                navigate(withDevPreview(href));
              }}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className={section === "learning" ? "classroom-nav-full" : undefined}>{label}</span>
              {section === "learning" && <span className="classroom-nav-short" aria-hidden="true">{tr("Теми", "Topics")}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default ClassWorkspaceNavigation;

export const ClassWorkspaceFrame: React.FC<Props & { children: React.ReactNode }> = ({ children, ...props }) => {
  const navigate = useNavigate();
  if (!Number.isSafeInteger(Number(props.classId)) || Number(props.classId) <= 0) return <div className="classroom-frame__body">{children}</div>;
  return <div className="classroom-frame">
    <aside className="classroom-context" aria-label={tr("Простір класу", "Class workspace")}>
      <button type="button" className="classroom-context__back" onClick={() => navigate(withDevPreview("/edu"))}><ArrowLeft className="size-4" aria-hidden="true" />{tr("Усі класи", "All classes")}</button>
      <div className="classroom-context__identity"><span><GraduationCap className="size-5" aria-hidden="true" /></span><div><strong>{props.className || tr("Клас", "Class")}</strong><small>{tr("Клас", "Class")}</small></div></div>
      <ClassWorkspaceNavigation {...props} />
    </aside>
    <div className="classroom-frame__body">{children}</div>
  </div>;
};
