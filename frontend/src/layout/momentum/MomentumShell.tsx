import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, GraduationCap, HelpCircle, Home, Library, Newspaper, Search, Shield, SwatchBook, Trophy, User as UserIcon, LogOut, Languages, Menu, FlaskConical, Compass, Users, CalendarDays, Bot } from "lucide-react";
import type { User } from "../../types";
import { Logo } from "../../components/Logo";
import { PlatformFooter } from "../../components/layout/PlatformFooter";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { WorkspaceViewportProvider } from "../../components/interface/WorkspaceViewport";
import { CommandPalette, type PaletteAction, type PaletteItem } from "../../components/interface/CommandPalette";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { prefetchNavTarget } from "../../lib/prefetchRoutes";
import { nextUIMode } from "../../lib/uiMode";

export type MomentumNavTarget =
  | "continue"
  | "lessons"
  | "tasks"
  | "grades"
  | "support"
  | "blog"
  | "library"
  | "contests"
  | "playground"
  | "learn"
  | "student"
  | "teacher"
  | "org"
  | "courses"
  | "calendar"
  | "tutor"
  | "admin"
  | "profile";

type Props = {
  user: User;
  current: MomentumNavTarget;
  onNavigate: (target: MomentumNavTarget) => void;
  onLogout: () => void;
  navigationHidden?: boolean;
  topRight?: React.ReactNode;
  children: React.ReactNode;
};

type NavItem = {
  id: MomentumNavTarget;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
};

// Warm the target route chunk on hover/focus so the click feels instant.
const prefetchProps = (id: MomentumNavTarget) => ({
  onPointerEnter: () => prefetchNavTarget(id),
  onFocus: () => prefetchNavTarget(id)
});

export const MomentumShell: React.FC<Props> = ({
  user,
  current,
  onNavigate,
  onLogout,
  navigationHidden = false,
  topRight,
  children
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ui = useUIMode();
  const cycleUIMode = () => {
    ui.setMode(nextUIMode(ui.mode));
  };
  const currentUIModeName =
    ui.mode === "focus"
      ? t("momentumUiName")
      : ui.mode === "nova"
        ? t("novaUiName", { defaultValue: "Nova" })
        : ui.mode === "aurora"
          ? t("auroraUiName", { defaultValue: "Aurora" })
          : t("classicUiName");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");
  const isUk = (i18n.language || "").startsWith("uk");

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);
  const isTeacher = isEducational && !isStudent;
  const primaryHomeId: MomentumNavTarget = isStudent ? "lessons" : isTeacher ? "teacher" : "continue";
  const primaryHomeLabel = isStudent ? t("lessons") : isTeacher ? t("eduNavSchool", { defaultValue: isUk ? "Школа" : "School" }) : t("session");

  const items = React.useMemo<NavItem[]>(() => [
    {
      id: primaryHomeId,
      label: primaryHomeLabel,
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
      id: "org",
      label: t("eduNavMembers", { defaultValue: isUk ? "Учасники" : "Members" }),
      icon: Users,
      show: isTeacher
    },
    {
      id: "courses",
      label: t("eduNavCourses", { defaultValue: isUk ? "Курси" : "Courses" }),
      icon: BookOpen,
      show: isTeacher
    },
    {
      id: "calendar",
      label: t("eduNavCalendar", { defaultValue: isUk ? "Календар" : "Calendar" }),
      icon: CalendarDays,
      show: isEducational
    },
    {
      id: "tutor",
      label: t("eduNavTutor", { defaultValue: isUk ? "AI-тьютор" : "AI tutor" }),
      icon: Bot,
      show: isEducational && isStudent
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
      id: "blog",
      label: t("blog"),
      icon: Newspaper,
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
      id: "learn",
      label: t("myLearning", { defaultValue: "My Learning" }),
      icon: Compass,
      // My Learning centers on the EDU skill tree (/edu/my/skill-tree), which is
      // empty/non-functional for non-students — so it must not show to personal
      // users or teachers, only to EDU students.
      show: isEducational && isStudent
    },
    {
      id: "playground",
      label: t("playground", { defaultValue: "Playground" }),
      icon: FlaskConical,
      show: true
    },
    {
      id: "profile",
      label: t("profile"),
      icon: UserIcon,
      show: true
    }
  ], [isEducational, isStudent, isTeacher, primaryHomeId, primaryHomeLabel, t, isUk, user.role]);

  const [workspaceViewportEl, setWorkspaceViewportEl] = React.useState<HTMLDivElement | null>(null);

  const mobilePrimaryIds = React.useMemo<MomentumNavTarget[]>(() => {
    const preferred: MomentumNavTarget[] = isEducational
      ? (isStudent
        ? ["lessons", "student", "library", "contests", "profile"]
        : ["teacher", "courses", "org", "library", "profile"])
      : ["continue", "tasks", "grades", "library", "profile"];

    return preferred.filter((id) => items.some((it) => it.id === id && it.show));
  }, [isEducational, isStudent, items]);

  const mobilePrimaryItems = React.useMemo(() => {
    return mobilePrimaryIds
      .map((id) => items.find((it) => it.id === id && it.show))
      .filter((it): it is NavItem => Boolean(it));
  }, [items, mobilePrimaryIds]);

  const mobileOverflowItems = React.useMemo(() => {
    return items.filter((it) => it.show && !mobilePrimaryIds.includes(it.id));
  }, [items, mobilePrimaryIds]);

  const currentLabel = React.useMemo(() => {
    const hit = items.find(it => it.id === current);
    return hit?.label ?? "";
  }, [items, current]);

  const searchLabel = t("searchOrJump", {
    defaultValue: isUk ? "Пошук або перехід…" : "Search or jump to…"
  });

  const paletteItems = React.useMemo<PaletteItem[]>(() => {
    const navGroup = t("navigation", { defaultValue: "Navigation" });
    return items
      .filter((it) => it.show)
      .map((it) => ({
        id: it.id,
        label: it.label,
        icon: it.icon,
        group: it.id === "profile" ? t("account") : navGroup
      }));
  }, [items, t]);

  const paletteActions = React.useMemo<PaletteAction[]>(() => [
    {
      id: "help",
      label: t("help"),
      icon: HelpCircle,
      run: () => navigate("/docs")
    },
    {
      id: "interface",
      label: `${t("interfaceLabel")}: ${currentUIModeName}`,
      icon: SwatchBook,
      run: () => {
        ui.setMode(nextUIMode(ui.mode));
      }
    },
    {
      id: "logout",
      label: t("logout"),
      icon: LogOut,
      danger: true,
      run: onLogout
    }
  ], [t, navigate, onLogout, ui, currentUIModeName]);

  // Global Ctrl+K / Cmd+K toggles the command palette while the shell shows nav.
  React.useEffect(() => {
    if (navigationHidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigationHidden]);

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

  if (navigationHidden) {
    return (
      <div data-ui-mode={ui.mode} className="mobile-app-shell min-h-[100dvh] bg-bg-base text-text-primary flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <WorkspaceViewportProvider element={workspaceViewportEl}>
            <div ref={setWorkspaceViewportEl} className="flex-1 min-h-0 overflow-y-auto">
              {children}
            </div>
          </WorkspaceViewportProvider>
        </div>
      </div>
    );
  }

  return (
    <div data-ui-mode={ui.mode} className="mobile-app-shell min-h-[100dvh] bg-bg-base text-text-primary flex">
      <aside className="hidden lg:flex w-[64px] xl:w-[76px] border-r border-border bg-bg-surface flex-col items-stretch">
        <div className="h-[72px] flex items-center justify-center border-b border-border">
          <button type="button"
            onClick={() => onNavigate(primaryHomeId)}
            className="w-11 h-11 rounded-xl border border-border bg-bg-code flex items-center justify-center hover:bg-bg-hover transition-fast"
            title="StudyCod"
            aria-label={t("goToSession")}
          >
            <Logo size={20} />
          </button>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-2 items-stretch">
          {items
            .filter(it => it.show)
            .map(it => {
              const Icon = it.icon;
              const active = current === it.id;
              return (
                <button type="button"
                  key={it.id}
                  onClick={() => onNavigate(it.id)}
                  {...prefetchProps(it.id)}
                  aria-label={it.label}
                  aria-pressed={active}
                  className={
                    "mx-2 h-11 rounded-xl flex items-center justify-center border transition-fast " +
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

        <div className="py-4 border-t border-border flex flex-col items-stretch gap-2">
          <button type="button"
            onClick={() => navigate("/docs")}
            className="mx-2 h-11 rounded-xl flex items-center justify-center border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
            title={t("help")}
            aria-label={t("help")}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="mx-2 h-11 w-[calc(100%-16px)] rounded-xl flex items-center justify-center border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
              title={t("menu")}
              aria-label={t("menu")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <UserIcon className="w-4 h-4" />
            </button>
            {menuOpen ? (
              <>
                <div className="absolute bottom-12 left-2 z-40 bg-bg-surface border border-border w-[min(240px,calc(100vw-90px))]" role="menu" aria-label={t("accountMenu")}>
                  <div className="px-3 py-2 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-b border-border">
                    {t("account")}
                  </div>
                  <button type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate("profile");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast"
                  >
                    {t("profile")}
                  </button>
                  <button type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/docs");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-text-secondary"
                  >
                    {t("help")}
                  </button>
                  <button type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      cycleUIMode();
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-text-secondary"
                  >
                    {t("interfaceLabel")}: {currentUIModeName}
                  </button>
                  <button type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-accent-error flex items-center gap-2"
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
        <div className="min-h-[58px] py-2 flex items-center justify-between px-3 md:px-4 border-b border-border bg-bg-base">
          <div className="min-w-0 flex items-center gap-2">
            {isCompactViewport ? (
              <button type="button"
                onClick={() => onNavigate(primaryHomeId)}
                className="w-11 h-11 rounded-xl border border-border bg-bg-surface flex items-center justify-center hover:bg-bg-hover transition-fast"
                aria-label={t("goToSession")}
                title="StudyCod"
              >
                <Logo size={16} />
              </button>
            ) : null}
            <div className="inline-flex items-center px-3 py-1 rounded-full border border-border bg-bg-surface text-xs font-mono font-medium tracking-[0.02em] text-text-secondary max-w-full">
              <span className="truncate">{currentLabel}</span>
            </div>
            {!isCompactViewport ? (
              <button type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-bg-surface text-xs font-mono text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
                aria-label={searchLabel}
                title={searchLabel}
                aria-haspopup="dialog"
              >
                <Search className="w-3.5 h-3.5" />
                <kbd className="text-[10px] font-mono text-text-muted">Ctrl K</kbd>
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 pl-2">
            {!isCompactViewport ? topRight : null}
            {isCompactViewport ? (
              <button type="button"
                onClick={() => setPaletteOpen(true)}
                className="h-11 w-11 rounded-xl border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center justify-center"
                aria-label={searchLabel}
                title={searchLabel}
                aria-haspopup="dialog"
              >
                <Search className="w-4 h-4" />
              </button>
            ) : null}
            <button type="button"
              onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium tracking-[0.03em] border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
              aria-label={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
            >
              <Languages className="w-3.5 h-3.5" />
              {i18n.language === "uk" ? "EN" : "UA"}
            </button>

            {isCompactViewport ? (
              <div className="relative" ref={menuRef}>
                <button type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="h-11 w-11 rounded-xl border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center justify-center"
                  aria-label={t("menu")}
                  title={t("menu")}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Menu className="w-4 h-4" />
                </button>

                {menuOpen ? (
                  <>
                  <button type="button" aria-label={t("close")} className="fixed inset-0 z-40 cursor-default bg-black/25" onClick={() => setMenuOpen(false)} />
                  <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] z-50 max-h-[min(70dvh,560px)] overflow-y-auto rounded-3xl border border-border bg-bg-surface shadow-2xl" role="menu" aria-label={t("accountMenu")}>
                    {topRight ? <div className="border-b border-border px-3 py-3">{topRight}</div> : null}
                    {mobileOverflowItems.length ? (
                      <>
                        <div className="px-3 py-2 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-b border-border">
                          {t("navigation", { defaultValue: "Navigation" })}
                        </div>
                        {mobileOverflowItems.map((it) => {
                          const Icon = it.icon;
                          return (
                            <button type="button"
                              key={`mnav-${it.id}`}
                              onClick={() => {
                                setMenuOpen(false);
                                onNavigate(it.id);
                              }}
                              {...prefetchProps(it.id)}
                              className="w-full min-h-12 px-3 py-3 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast flex items-center gap-2"
                            >
                              <Icon className="w-4 h-4" />
                              {it.label}
                            </button>
                          );
                        })}
                      </>
                    ) : null}

                    <div className="px-3 py-2 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-y border-border">
                      {t("account")}
                    </div>
                    <button type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate("profile");
                      }}
                      className="w-full min-h-12 px-3 py-3 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast"
                    >
                      {t("profile")}
                    </button>
                    <button type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/docs");
                      }}
                      className="w-full min-h-12 px-3 py-3 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-text-secondary"
                    >
                      {t("help")}
                    </button>
                    <button type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        cycleUIMode();
                      }}
                      className="w-full min-h-12 px-3 py-3 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-text-secondary"
                    >
                      {t("interfaceLabel")}: {currentUIModeName}
                    </button>
                    <button type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full min-h-12 px-3 py-3 text-left text-sm font-mono font-medium hover:bg-bg-hover transition-fast text-accent-error flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("logout")}
                    </button>
                  </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <div
            ref={setWorkspaceViewportEl}
            className={`mobile-app-viewport flex-1 min-h-0 overflow-y-auto flex flex-col ${isCompactViewport ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]" : ""}`}
          >
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
            <PlatformFooter compact={isCompactViewport} className="mt-auto" />
          </div>
        </WorkspaceViewportProvider>
      </div>

      {isCompactViewport ? (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-surface/96 backdrop-blur px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1">
            {mobilePrimaryItems.map((it) => {
              const Icon = it.icon;
              const active = current === it.id;
              return (
                <button type="button"
                  key={`bottom-${it.id}`}
                  onClick={() => onNavigate(it.id)}
                  {...prefetchProps(it.id)}
                  aria-current={active ? "page" : undefined}
                  className={`min-h-12 rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center gap-1 transition-fast ${active ? "border-primary bg-primary/12 text-primary" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
                  aria-label={it.label}
                  aria-pressed={active}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] leading-none truncate max-w-full">{it.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(id) => onNavigate(id as MomentumNavTarget)}
        extraActions={paletteActions}
      />
    </div>
  );
};
