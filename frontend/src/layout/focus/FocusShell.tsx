import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, GraduationCap, HelpCircle, Home, Library, Shield, Trophy, User as UserIcon, LogOut } from "lucide-react";
import type { User } from "../../types";
import { Logo } from "../../components/Logo";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { WorkspaceViewportProvider } from "../../components/interface/WorkspaceViewport";

export type FocusNavTarget =
  | "continue"
  | "tasks"
  | "grades"
  | "support"
  | "library"
  | "contests"
  | "student"
  | "teacher"
  | "admin"
  | "profile";

type Props = {
  user: User;
  current: FocusNavTarget;
  onNavigate: (target: FocusNavTarget) => void;
  onLogout: () => void;
  topRight?: React.ReactNode;
  children: React.ReactNode;
};

type NavItem = {
  id: FocusNavTarget;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
};

export const FocusShell: React.FC<Props> = ({
  user,
  current,
  onNavigate,
  onLogout,
  topRight,
  children
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ui = useUIMode();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);
  const isTeacher = isEducational && !isStudent;

  const items: NavItem[] = [
    {
      id: "continue",
      label: i18n.language?.toLowerCase().startsWith("en") ? "Session" : "Сесія",
      icon: Home,
      show: true
    },
    {
      id: "tasks",
      label: t("tasks"),
      icon: FileText,
      show: !isEducational
    },
    {
      id: "grades",
      label: t("grades"),
      icon: GraduationCap,
      show: !isEducational
    },
    {
      id: "student",
      label: t("myJournal"),
      icon: BookOpen,
      show: isEducational && isStudent
    },
    {
      id: "teacher",
      label: t("myClasses"),
      icon: GraduationCap,
      show: isEducational && isTeacher
    },
    {
      id: "admin",
      label: "Admin",
      icon: Shield,
      show: user.role === "SYSTEM_ADMIN"
    },
    {
      id: "support",
      label: i18n.language?.toLowerCase().startsWith("en") ? "Support" : "Підтримка",
      icon: HelpCircle,
      show: true
    },
    {
      id: "library",
      label: t("library"),
      icon: Library,
      show: true
    },
    {
      id: "contests",
      label: t("contests", { defaultValue: "Contests" }),
      icon: Trophy,
      show: true
    },
    {
      id: "profile",
      label: t("profile"),
      icon: UserIcon,
      show: true
    }
  ];

  const [workspaceViewportEl, setWorkspaceViewportEl] = React.useState<HTMLDivElement | null>(null);

  const currentLabel = React.useMemo(() => {
    const hit = items.find(it => it.id === current);
    return hit?.label ?? "";
  }, [items, current]);

  React.useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div data-ui-mode={ui.mode} className="min-h-[100dvh] bg-bg-base text-text-primary flex">
      <aside className="w-[72px] border-r border-border bg-bg-surface flex flex-col items-stretch">
        <div className="h-16 flex items-center justify-center border-b border-border">
          <button
            onClick={() => onNavigate("continue")}
            className="w-10 h-10 border border-border bg-bg-code flex items-center justify-center hover:bg-bg-hover transition-fast"
            title="StudyCod"
          >
            <Logo size={20} />
          </button>
        </div>

        <nav className="flex-1 py-3 flex flex-col gap-1 items-stretch">
          {items
            .filter(it => it.show)
            .map(it => {
              const Icon = it.icon;
              const active = current === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => onNavigate(it.id)}
                  className={
                    "mx-2 h-11 flex items-center justify-center border transition-fast " +
                    (active
                      ? "border-primary bg-bg-hover text-primary"
                      : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40")
                  }
                  title={it.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
        </nav>

        <div className="py-3 border-t border-border flex flex-col items-stretch gap-2">
          <button
            onClick={() => navigate("/docs")}
            className="mx-2 h-11 flex items-center justify-center border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
            title={t("help")}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="mx-2 h-11 w-[calc(100%-16px)] flex items-center justify-center border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              title={t("menu")}
            >
              <UserIcon className="w-4 h-4" />
            </button>
            {menuOpen ? (
              <>
                <div className="absolute bottom-12 left-2 z-40 bg-bg-surface border border-border w-[240px]">
                  <div className="px-3 py-2 text-xs font-mono text-text-secondary border-b border-border">
                    {i18n.language?.toLowerCase().startsWith("en") ? "Account" : "Акаунт"}
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate("profile");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast"
                  >
                    {t("profile")}
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      // Keep switch accessible, not dominant: route to profile where toggle lives.
                      onNavigate("profile");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-text-secondary"
                  >
                    {i18n.language?.toLowerCase().startsWith("en") ? "Interface" : "Інтерфейс"}: {ui.mode === "focus" ? "Focus" : "Classic"}
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-accent-error flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("logout")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-bg-base">
          <div className="text-xs font-mono text-text-secondary truncate">{currentLabel}</div>
          <div className="flex items-center gap-2">
            {topRight}
            <button
              onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
              className="px-2 py-1 text-[11px] font-mono border border-border hover:bg-bg-hover transition-fast"
              title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
            >
              {i18n.language === "uk" ? "EN" : "UA"}
            </button>
          </div>
        </div>

        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <div ref={setWorkspaceViewportEl} className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        </WorkspaceViewportProvider>
      </div>
    </div>
  );
};
