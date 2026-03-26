import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, GraduationCap, HelpCircle, Home, Library, Shield, Trophy, User as UserIcon, LogOut, Languages } from "lucide-react";
import type { User } from "../../types";
import { Logo } from "../../components/Logo";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { WorkspaceViewportProvider } from "../../components/interface/WorkspaceViewport";

export type MomentumNavTarget =
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
  current: MomentumNavTarget;
  onNavigate: (target: MomentumNavTarget) => void;
  onLogout: () => void;
  topRight?: React.ReactNode;
  children: React.ReactNode;
};

type NavItem = {
  id: MomentumNavTarget;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
};

export const MomentumShell: React.FC<Props> = ({
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
      label: t("session"),
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
      label: t("support"),
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
            aria-label={t("goToSession")}
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
                  aria-label={it.label}
                  aria-pressed={active}
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
            aria-label={t("help")}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="mx-2 h-11 w-[calc(100%-16px)] flex items-center justify-center border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              title={t("menu")}
              aria-label={t("menu")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <UserIcon className="w-4 h-4" />
            </button>
            {menuOpen ? (
              <>
                <div className="absolute bottom-12 left-2 z-40 bg-bg-surface border border-border w-[240px]" role="menu" aria-label={t("accountMenu")}>
                  <div className="px-3 py-2 text-xs font-mono text-text-secondary border-b border-border">
                    {t("account")}
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
                      ui.setMode(ui.mode === "focus" ? "classic" : "focus");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-text-secondary"
                  >
                    {t("interfaceLabel")}: {ui.mode === "focus" ? t("momentumUiName") : t("classicUiName")}
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
        <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-bg-base/90 backdrop-blur-sm">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-bg-surface text-xs font-mono text-text-secondary max-w-full">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
              <span className="truncate">{currentLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-2">
            {topRight}
            <button
              onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
            >
              <Languages className="w-3.5 h-3.5" />
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
