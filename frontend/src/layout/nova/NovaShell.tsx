import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  BookOpen,
  Compass,
  FileText,
  FlaskConical,
  GraduationCap,
  HelpCircle,
  Home,
  Languages,
  Library,
  LogOut,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  SwatchBook,
  Trophy,
  User as UserIcon
} from "lucide-react";
import type { User } from "../../types";
import { Logo } from "../../components/Logo";
import { PlatformFooter } from "../../components/layout/PlatformFooter";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { WorkspaceViewportProvider } from "../../components/interface/WorkspaceViewport";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { prefetchNavTarget } from "../../lib/prefetchRoutes";
import { nextUIMode } from "../../lib/uiMode";
import type { MomentumNavTarget } from "../momentum/MomentumShell";
import { NOVA, novaDur, prefersReducedMotion } from "../../lib/novaMotion";
import {
  NovaCommandPalette,
  type NovaPaletteAction,
  type NovaPaletteItem
} from "./NovaCommandPalette";

const KBD_HINT_SEEN_KEY = "studycod.nova.kbdHintSeen";

// The shell remounts on every top-level route change; replaying the sidebar
// entrance each time reads as a "nav reload", so play it once per session.
let sidebarEntrancePlayed = false;

const SIDEBAR_COLLAPSED_KEY = "studycod.nova.sidebarCollapsed";

export type NovaShellProps = {
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

type NavGroupId = "workspace" | "explore" | "system";

const GROUP_ORDER: NavGroupId[] = ["workspace", "explore", "system"];

const GROUP_OF: Partial<Record<MomentumNavTarget, NavGroupId>> = {
  continue: "workspace",
  lessons: "workspace",
  tasks: "workspace",
  grades: "workspace",
  student: "workspace",
  teacher: "workspace",
  library: "explore",
  contests: "explore",
  playground: "explore",
  learn: "explore",
  admin: "system",
  support: "system",
  blog: "system"
};

// Warm the target route chunk on hover/focus so the click feels instant.
const prefetchProps = (id: MomentumNavTarget) => ({
  onPointerEnter: () => prefetchNavTarget(id),
  onFocus: () => prefetchNavTarget(id)
});

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export const NovaShell: React.FC<NovaShellProps> = ({
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
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");
  const isUk = (i18n.language || "").startsWith("uk");

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

  const [collapsed, setCollapsed] = React.useState<boolean>(() => readSidebarCollapsed());
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [workspaceViewportEl, setWorkspaceViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [topBarScrolled, setTopBarScrolled] = React.useState(false);

  const asideRef = React.useRef<HTMLElement | null>(null);
  const navRef = React.useRef<HTMLElement | null>(null);
  const indicatorRef = React.useRef<HTMLSpanElement | null>(null);
  const accountPopoverRef = React.useRef<HTMLDivElement | null>(null);
  const mobileSheetRef = React.useRef<HTMLDivElement | null>(null);
  const kbdRef = React.useRef<HTMLElement | null>(null);
  const indicatorPlacedRef = React.useRef(false);

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);
  const isTeacher = isEducational && !isStudent;
  const primaryHomeId: MomentumNavTarget = isEducational && isStudent ? "lessons" : "continue";
  const primaryHomeLabel = isEducational && isStudent ? t("lessons") : t("session");

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
  ], [isEducational, isStudent, isTeacher, primaryHomeId, primaryHomeLabel, t, user.role]);

  const groupLabels = React.useMemo<Record<NavGroupId, string>>(() => ({
    workspace: t("novaGroupWorkspace", { defaultValue: isUk ? "Робочий простір" : "Workspace" }),
    explore: t("novaGroupExplore", { defaultValue: isUk ? "Огляд" : "Explore" }),
    system: t("novaGroupSystem", { defaultValue: isUk ? "Система" : "System" })
  }), [t, isUk]);

  const sidebarGroups = React.useMemo(() => {
    return GROUP_ORDER
      .map((groupId) => ({
        id: groupId,
        label: groupLabels[groupId],
        items: items.filter((it) => it.show && GROUP_OF[it.id] === groupId)
      }))
      .filter((group) => group.items.length > 0);
  }, [items, groupLabels]);

  const mobilePrimaryIds = React.useMemo<MomentumNavTarget[]>(() => {
    const preferred: MomentumNavTarget[] = isEducational
      ? (isStudent
        ? ["lessons", "student", "library", "contests", "profile"]
        : ["continue", "teacher", "library", "contests", "profile"])
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
    const hit = items.find((it) => it.id === current);
    return hit?.label ?? "";
  }, [items, current]);

  const paletteItems = React.useMemo<NovaPaletteItem[]>(() => {
    const grouped: NovaPaletteItem[] = sidebarGroups.flatMap((group) =>
      group.items.map((it) => ({
        id: it.id,
        label: it.label,
        icon: it.icon,
        group: group.label
      }))
    );
    const profile = items.find((it) => it.id === "profile" && it.show);
    if (profile) {
      grouped.push({
        id: profile.id,
        label: profile.label,
        icon: profile.icon,
        group: t("account")
      });
    }
    return grouped;
  }, [sidebarGroups, items, t]);

  const paletteActions = React.useMemo<NovaPaletteAction[]>(() => [
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

  const searchLabel = t("searchOrJump", {
    defaultValue: isUk ? "Пошук або перехід…" : "Search or jump to…"
  });

  const persistCollapsed = React.useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures (private mode etc.)
    }
  }, []);

  // Sidebar collapse/expand: GSAP owns only the label opacity/x; CSS owns width.
  const { contextSafe } = useGSAP(
    () => {
      if (collapsed) {
        gsap.set("[data-nav-label]", { autoAlpha: 0, x: -6 });
      }
    },
    { scope: asideRef }
  );

  const toggleCollapsed = contextSafe(() => {
    if (!collapsed) {
      gsap.to("[data-nav-label]", {
        autoAlpha: 0,
        x: -6,
        duration: novaDur(NOVA.dur.fast),
        ease: NOVA.ease.in,
        stagger: NOVA.stagger.tight,
        overwrite: true
      });
      setCollapsed(true);
      persistCollapsed(true);
    } else {
      setCollapsed(false);
      persistCollapsed(false);
      gsap.to("[data-nav-label]", {
        autoAlpha: 1,
        x: 0,
        delay: novaDur(0.08),
        duration: novaDur(NOVA.dur.fast),
        ease: NOVA.ease.out,
        stagger: NOVA.stagger.tight,
        overwrite: true
      });
    }
  });

  // Sliding active indicator on the desktop sidebar.
  useGSAP(
    () => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      const btn = navRef.current?.querySelector<HTMLElement>(`[data-nav-id="${current}"]`);
      if (!btn) {
        gsap.to(indicator, {
          autoAlpha: 0,
          duration: novaDur(NOVA.dur.fast),
          ease: NOVA.ease.out,
          overwrite: true
        });
        return;
      }
      if (!indicatorPlacedRef.current) {
        gsap.set(indicator, {
          autoAlpha: 1,
          y: btn.offsetTop,
          height: btn.offsetHeight
        });
        indicatorPlacedRef.current = true;
        return;
      }
      gsap.to(indicator, {
        autoAlpha: 1,
        y: btn.offsetTop,
        height: btn.offsetHeight,
        duration: novaDur(NOVA.dur.base),
        ease: NOVA.ease.inOut,
        overwrite: true
      });
    },
    { dependencies: [current, collapsed], scope: asideRef }
  );

  // First-mount one-shot stagger of the desktop nav buttons (once per session).
  useGSAP(
    () => {
      if (sidebarEntrancePlayed) return;
      sidebarEntrancePlayed = true;
      gsap.from("[data-nav-id]", {
        autoAlpha: 0,
        x: -8,
        duration: novaDur(NOVA.dur.base),
        ease: NOVA.ease.out,
        stagger: NOVA.stagger.base
      });
    },
    { scope: asideRef }
  );

  // Account popover entrance.
  useGSAP(
    () => {
      if (!accountOpen || !accountPopoverRef.current) return;
      gsap.from(accountPopoverRef.current, {
        autoAlpha: 0,
        y: 6,
        scale: 0.98,
        transformOrigin: "left bottom",
        duration: novaDur(NOVA.dur.fast),
        ease: NOVA.ease.out
      });
      gsap.from(accountPopoverRef.current.querySelectorAll("[role='menuitem']"), {
        autoAlpha: 0,
        y: 4,
        duration: novaDur(NOVA.dur.fast),
        ease: NOVA.ease.out,
        stagger: NOVA.stagger.tight
      });
    },
    { dependencies: [accountOpen], scope: accountRef }
  );

  // Mobile overflow sheet entrance.
  useGSAP(
    () => {
      if (!mobileMenuOpen || !mobileSheetRef.current) return;
      gsap.from(mobileSheetRef.current, {
        autoAlpha: 0,
        y: 6,
        scale: 0.98,
        transformOrigin: "right top",
        duration: novaDur(NOVA.dur.fast),
        ease: NOVA.ease.out
      });
    },
    { dependencies: [mobileMenuOpen], scope: mobileMenuRef }
  );

  // Ctrl K hint pulse, once ever.
  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        try {
          window.localStorage.setItem(KBD_HINT_SEEN_KEY, "1");
        } catch {
          // Ignore storage failures.
        }
        return;
      }
      let seen = false;
      try {
        seen = window.localStorage.getItem(KBD_HINT_SEEN_KEY) === "1";
      } catch {
        seen = false;
      }
      if (seen || !kbdRef.current) return;
      const tween = gsap.delayedCall(0.6, () => {
        if (!kbdRef.current) return;
        gsap.fromTo(
          kbdRef.current,
          { scale: 0.9 },
          { scale: 1, duration: NOVA.dur.slow, ease: NOVA.ease.pop }
        );
        try {
          window.localStorage.setItem(KBD_HINT_SEEN_KEY, "1");
        } catch {
          // Ignore storage failures.
        }
      });
      return () => tween.kill();
    },
    { scope: asideRef }
  );

  // Top-bar scroll elevation (CSS-driven; reduced-motion handled by global kill-switch).
  React.useEffect(() => {
    const el = workspaceViewportEl;
    if (!el) return;
    const onScroll = () => {
      const next = el.scrollTop > 8;
      setTopBarScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [workspaceViewportEl]);

  // Global Ctrl+K / Cmd+K opens the command palette while the shell shows nav.
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

  // Close the account popover on outside click / Escape.
  React.useEffect(() => {
    if (!accountOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (accountRef.current?.contains(target)) return;
      setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  // Close the mobile menu on outside click / Escape.
  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileMenuRef.current?.contains(target)) return;
      setMobileMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleNavigate = React.useCallback((target: MomentumNavTarget) => {
    setAccountOpen(false);
    setMobileMenuOpen(false);
    onNavigate(target);
  }, [onNavigate]);

  const avatarLetter = (user.username || "?").charAt(0).toUpperCase();

  if (navigationHidden) {
    return (
      <div data-ui-mode="nova" className="min-h-[100dvh] bg-bg-base text-text-primary flex">
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
    <div data-ui-mode="nova" className="min-h-[100dvh] bg-bg-base text-text-primary flex">
      <aside
        ref={asideRef}
        className={
          "hidden lg:flex flex-col border-r border-border bg-bg-surface transition-[width] duration-200 " +
          (collapsed ? "w-16" : "w-[240px]")
        }
      >
        <div className="h-14 shrink-0 flex items-center border-b border-border px-3 overflow-hidden">
          <button
            type="button"
            onClick={() => handleNavigate(primaryHomeId)}
            className="h-10 rounded-lg flex items-center gap-2.5 px-2 min-w-0 hover:bg-bg-hover transition-colors duration-150"
            title="StudyCod"
            aria-label={t("goToSession")}
          >
            <Logo size={20} className="shrink-0" />
            <span
              data-nav-label
              className="font-mono font-semibold text-sm tracking-tight text-text-primary truncate whitespace-nowrap overflow-hidden"
            >
              StudyCod
            </span>
          </button>
        </div>

        <nav ref={navRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-4">
          <span
            ref={indicatorRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 w-0.5 rounded-full bg-primary"
          />
          {sidebarGroups.map((group) => (
            <div key={group.id} className="px-2 flex flex-col gap-0.5">
              <div
                data-nav-label
                className={
                  "px-3 pb-1 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted whitespace-nowrap overflow-hidden " +
                  (collapsed ? "h-0 pb-0" : "")
                }
              >
                {group.label}
              </div>
              {group.items.map((it) => {
                const Icon = it.icon;
                const active = current === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    data-nav-id={it.id}
                    onClick={() => handleNavigate(it.id)}
                    {...prefetchProps(it.id)}
                    aria-label={it.label}
                    aria-pressed={active}
                    title={collapsed ? it.label : undefined}
                    className={
                      "h-10 rounded-lg flex items-center gap-3 px-3 transition-colors duration-150 " +
                      (active
                        ? "bg-primary/10 text-primary"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary")
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span
                      data-nav-label
                      className="text-sm font-medium truncate whitespace-nowrap overflow-hidden"
                    >
                      {it.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* No overflow-hidden here: the account popover renders above via bottom-full. */}
        <div className="shrink-0 border-t border-border p-2 flex flex-col gap-1">
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              className="w-full h-11 rounded-lg flex items-center gap-2.5 px-2 min-w-0 hover:bg-bg-hover transition-colors duration-150"
              title={collapsed ? user.username : undefined}
              aria-label={t("accountMenu")}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
            >
              <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                {avatarLetter}
              </span>
              <span
                data-nav-label
                className="text-sm font-medium text-text-primary truncate whitespace-nowrap overflow-hidden"
              >
                {user.username}
              </span>
            </button>

            {accountOpen ? (
              <div
                ref={accountPopoverRef}
                className="absolute bottom-full mb-2 left-0 z-40 w-[min(224px,calc(100vw-90px))] rounded-lg border border-border bg-bg-surface shadow-lg overflow-hidden"
                role="menu"
                aria-label={t("accountMenu")}
              >
                <div className="px-3 py-2 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-b border-border truncate">
                  {user.username}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    handleNavigate("profile");
                  }}
                  className="w-full min-h-10 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-primary"
                  role="menuitem"
                >
                  <UserIcon className="w-4 h-4" />
                  {t("profile")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    navigate("/docs");
                  }}
                  className="w-full min-h-10 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-secondary"
                  role="menuitem"
                >
                  <HelpCircle className="w-4 h-4" />
                  {t("help")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    cycleUIMode();
                  }}
                  className="w-full min-h-10 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-secondary"
                  role="menuitem"
                >
                  <SwatchBook className="w-4 h-4" />
                  {t("interfaceLabel")}: {currentUIModeName}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    onLogout();
                  }}
                  className="w-full min-h-10 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-accent-error"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  {t("logout")}
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="h-10 rounded-lg flex items-center gap-3 px-3 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-150"
            title={collapsed
              ? t("expandSidebar", { defaultValue: isUk ? "Розгорнути панель" : "Expand sidebar" })
              : t("collapseSidebar", { defaultValue: isUk ? "Згорнути панель" : "Collapse sidebar" })}
            aria-label={collapsed
              ? t("expandSidebar", { defaultValue: isUk ? "Розгорнути панель" : "Expand sidebar" })
              : t("collapseSidebar", { defaultValue: isUk ? "Згорнути панель" : "Collapse sidebar" })}
            aria-pressed={collapsed}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
            <span
              data-nav-label
              className="text-sm font-medium truncate whitespace-nowrap overflow-hidden"
            >
              {t("collapseSidebar", { defaultValue: isUk ? "Згорнути панель" : "Collapse sidebar" })}
            </span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className={
            "h-14 shrink-0 flex items-center gap-2 px-3 md:px-4 border-b border-border bg-bg-base transition-shadow duration-200 " +
            (topBarScrolled ? "shadow-[0_6px_16px_-12px_rgba(0,0,0,0.55)]" : "")
          }
        >
          {isCompactViewport ? (
            <button
              type="button"
              onClick={() => handleNavigate(primaryHomeId)}
              className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center hover:bg-bg-hover transition-colors duration-150"
              aria-label={t("goToSession")}
              title="StudyCod"
            >
              <Logo size={18} />
            </button>
          ) : null}

          <div className="min-w-0 shrink text-sm font-medium text-text-primary truncate">
            {currentLabel}
          </div>

          {!isCompactViewport ? (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-4 flex-1 max-w-md h-9 px-3 rounded-lg border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-150 flex items-center gap-2"
              aria-label={searchLabel}
              aria-haspopup="dialog"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left text-sm truncate">{searchLabel}</span>
              <kbd
                ref={kbdRef}
                className="px-1.5 py-0.5 rounded border border-border bg-bg-base text-[10px] font-mono text-text-muted"
              >
                Ctrl K
              </kbd>
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {isCompactViewport ? (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="w-11 h-11 rounded-lg flex items-center justify-center text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-150"
                aria-label={searchLabel}
                title={searchLabel}
                aria-haspopup="dialog"
              >
                <Search className="w-5 h-5" />
              </button>
            ) : null}

            {topRight}

            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
              className="h-11 lg:h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-mono font-medium tracking-[0.03em] border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-150"
              title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
              aria-label={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
            >
              <Languages className="w-3.5 h-3.5" />
              {i18n.language === "uk" ? "EN" : "UA"}
            </button>

            {isCompactViewport ? (
              <div className="relative" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="w-11 h-11 rounded-lg border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-150 flex items-center justify-center"
                  aria-label={t("menu")}
                  title={t("menu")}
                  aria-haspopup="menu"
                  aria-expanded={mobileMenuOpen}
                >
                  <Menu className="w-5 h-5" />
                </button>

                {mobileMenuOpen ? (
                  <div
                    ref={mobileSheetRef}
                    className="absolute right-0 top-12 z-40 w-[min(280px,calc(100vw-1rem))] rounded-lg border border-border bg-bg-surface shadow-lg overflow-hidden"
                    role="menu"
                    aria-label={t("accountMenu")}
                  >
                    {mobileOverflowItems.length ? (
                      <>
                        <div className="px-3 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted border-b border-border">
                          {t("navigation", { defaultValue: "Navigation" })}
                        </div>
                        {mobileOverflowItems.map((it) => {
                          const Icon = it.icon;
                          return (
                            <button
                              key={`mnav-${it.id}`}
                              type="button"
                              onClick={() => handleNavigate(it.id)}
                              {...prefetchProps(it.id)}
                              className="w-full min-h-11 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-primary"
                              role="menuitem"
                            >
                              <Icon className="w-4 h-4" />
                              {it.label}
                            </button>
                          );
                        })}
                      </>
                    ) : null}

                    <div className="px-3 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted border-y border-border">
                      {t("account")}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigate("profile")}
                      className="w-full min-h-11 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-primary"
                      role="menuitem"
                    >
                      <UserIcon className="w-4 h-4" />
                      {t("profile")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        navigate("/docs");
                      }}
                      className="w-full min-h-11 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-secondary"
                      role="menuitem"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {t("help")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        cycleUIMode();
                      }}
                      className="w-full min-h-11 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-text-secondary"
                      role="menuitem"
                    >
                      <SwatchBook className="w-4 h-4" />
                      {t("interfaceLabel")}: {currentUIModeName}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full min-h-11 px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-colors duration-150 flex items-center gap-2 text-accent-error"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <div
            ref={setWorkspaceViewportEl}
            className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${isCompactViewport ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]" : ""}`}
          >
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
            <PlatformFooter compact={isCompactViewport} className="mt-auto" />
          </div>
        </WorkspaceViewportProvider>
      </div>

      {isCompactViewport ? (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-surface/95 backdrop-blur px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1">
            {mobilePrimaryItems.map((it) => {
              const Icon = it.icon;
              const active = current === it.id;
              return (
                <button
                  key={`bottom-${it.id}`}
                  type="button"
                  onClick={() => handleNavigate(it.id)}
                  {...prefetchProps(it.id)}
                  className={
                    "min-h-11 rounded-lg px-1 py-1.5 flex flex-col items-center justify-center gap-1 transition-colors duration-150 " +
                    (active
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover")
                  }
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

      <NovaCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(id) => handleNavigate(id as MomentumNavTarget)}
        extraActions={paletteActions}
      />
    </div>
  );
};
