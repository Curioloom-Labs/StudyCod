import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
import { CommandPalette, type PaletteAction, type PaletteItem } from "../../components/interface/CommandPalette";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { prefetchNavTarget } from "../../lib/prefetchRoutes";
import { nextUIMode } from "../../lib/uiMode";
import type { MomentumNavTarget } from "../momentum/MomentumShell";

export type AuroraShellProps = {
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

type ZoneId = "workspace" | "explore" | "system";

const ZONE_ORDER: ZoneId[] = ["workspace", "explore", "system"];

// Aurora surfaces navigation as top-bar zones; the rail then shows only the
// *active* zone's items (contextual), rather than the whole menu at once.
const ZONE_OF: Partial<Record<MomentumNavTarget, ZoneId>> = {
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
  support: "system"
};

// Warm the target route chunk on hover/focus so the click feels instant.
const prefetchProps = (id: MomentumNavTarget) => ({
  onPointerEnter: () => prefetchNavTarget(id),
  onFocus: () => prefetchNavTarget(id)
});

export const AuroraShell: React.FC<AuroraShellProps> = ({
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

  const cycleUIMode = () => ui.setMode(nextUIMode(ui.mode));
  const currentUIModeName =
    ui.mode === "aurora"
      ? t("auroraUiName", { defaultValue: "Aurora" })
      : ui.mode === "focus"
        ? t("momentumUiName")
        : ui.mode === "nova"
          ? t("novaUiName", { defaultValue: "Nova" })
          : t("classicUiName");

  const [accountOpen, setAccountOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [workspaceViewportEl, setWorkspaceViewportEl] = React.useState<HTMLDivElement | null>(null);

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);
  const isTeacher = isEducational && !isStudent;
  const primaryHomeId: MomentumNavTarget = isEducational && isStudent ? "lessons" : "continue";
  const primaryHomeLabel = isEducational && isStudent ? t("lessons") : t("session");

  const items = React.useMemo<NavItem[]>(() => [
    { id: primaryHomeId, label: primaryHomeLabel, icon: Home, show: true },
    { id: "tasks", label: t("tasks"), icon: FileText, show: !isEducational },
    { id: "grades", label: t("grades"), icon: GraduationCap, show: !isEducational },
    { id: "student", label: t("myJournal"), icon: BookOpen, show: isEducational && isStudent },
    { id: "teacher", label: t("myClasses"), icon: GraduationCap, show: isEducational && isTeacher },
    { id: "admin", label: "Admin", icon: Shield, show: user.role === "SYSTEM_ADMIN" },
    { id: "support", label: t("support"), icon: HelpCircle, show: true },
    { id: "library", label: t("library"), icon: Library, show: true },
    { id: "contests", label: t("contests", { defaultValue: "Contests" }), icon: Trophy, show: true },
    {
      id: "learn",
      label: t("myLearning", { defaultValue: "My Learning" }),
      icon: Compass,
      // My Learning centers on the EDU skill tree, empty for non-students.
      show: isEducational && isStudent
    },
    { id: "playground", label: t("playground", { defaultValue: "Playground" }), icon: FlaskConical, show: true },
    { id: "profile", label: t("profile"), icon: UserIcon, show: true }
  ], [isEducational, isStudent, isTeacher, primaryHomeId, primaryHomeLabel, t, user.role]);

  const zoneLabels = React.useMemo<Record<ZoneId, string>>(() => ({
    workspace: t("novaGroupWorkspace", { defaultValue: isUk ? "Робочий простір" : "Workspace" }),
    explore: t("novaGroupExplore", { defaultValue: isUk ? "Огляд" : "Explore" }),
    system: t("novaGroupSystem", { defaultValue: isUk ? "Система" : "System" })
  }), [t, isUk]);

  const zones = React.useMemo(() => {
    return ZONE_ORDER
      .map((id) => ({
        id,
        label: zoneLabels[id],
        items: items.filter((it) => it.show && ZONE_OF[it.id] === id)
      }))
      .filter((zone) => zone.items.length > 0);
  }, [items, zoneLabels]);

  // The rail follows the zone of the active page; account/profile pages fall
  // back to the first zone so navigation stays reachable.
  const activeZoneId: ZoneId = (ZONE_OF[current] ?? zones[0]?.id ?? "workspace");
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? zones[0];

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
    return items.find((it) => it.id === current)?.label ?? "";
  }, [items, current]);

  const searchLabel = t("searchOrJump", {
    defaultValue: isUk ? "Пошук або перехід…" : "Search or jump to…"
  });

  const paletteItems = React.useMemo<PaletteItem[]>(() => {
    const grouped: PaletteItem[] = zones.flatMap((zone) =>
      zone.items.map((it) => ({ id: it.id, label: it.label, icon: it.icon, group: zone.label }))
    );
    const profile = items.find((it) => it.id === "profile" && it.show);
    if (profile) {
      grouped.push({ id: profile.id, label: profile.label, icon: profile.icon, group: t("account") });
    }
    return grouped;
  }, [zones, items, t]);

  const paletteActions = React.useMemo<PaletteAction[]>(() => [
    { id: "help", label: t("help"), icon: HelpCircle, run: () => navigate("/docs") },
    {
      id: "interface",
      label: `${t("interfaceLabel")}: ${currentUIModeName}`,
      icon: SwatchBook,
      run: cycleUIMode
    },
    { id: "logout", label: t("logout"), icon: LogOut, danger: true, run: onLogout }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, navigate, onLogout, ui.mode, currentUIModeName]);

  // Global Ctrl+K / Cmd+K toggles the palette — Aurora's primary nav channel.
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

  // Close account popover on outside click / Escape.
  React.useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || accountRef.current?.contains(target)) return;
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

  // Close mobile menu on outside click / Escape.
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || mobileMenuRef.current?.contains(target)) return;
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
      <div data-ui-mode="aurora" className="min-h-[100dvh] bg-bg-base text-text-primary flex">
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
    <div data-ui-mode="aurora" className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      {/* Command bar — the dominant element; navigation is summoned here. */}
      <header className="h-16 shrink-0 flex items-center gap-3 px-3 md:px-5 border-b border-border bg-bg-base/90 backdrop-blur supports-[backdrop-filter]:bg-bg-base/75">
        <button
          type="button"
          onClick={() => handleNavigate(primaryHomeId)}
          className="h-10 rounded-xl flex items-center gap-2.5 px-2 min-w-0 hover:bg-bg-hover transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          title="StudyCod"
          aria-label={t("goToSession")}
        >
          <Logo size={22} className="shrink-0" />
          {!isCompactViewport ? (
            <span className="font-mono font-semibold text-sm tracking-tight text-text-primary">StudyCod</span>
          ) : null}
        </button>

        {/* Desktop zone switcher: top-level navigation as editorial tabs. */}
        {!isCompactViewport && zones.length > 1 ? (
          <nav
            className="ml-1 flex items-center gap-1 p-1 rounded-full border border-border bg-bg-surface/70"
            aria-label={t("navigation", { defaultValue: "Navigation" })}
          >
            {zones.map((zone) => {
              const active = zone.id === activeZoneId;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => handleNavigate(zone.items[0].id)}
                  {...prefetchProps(zone.items[0].id)}
                  aria-pressed={active}
                  className={
                    "px-3.5 h-8 rounded-full text-xs font-mono font-medium tracking-[0.02em] transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                    (active
                      ? "bg-primary/12 text-primary"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary")
                  }
                >
                  {zone.label}
                </button>
              );
            })}
          </nav>
        ) : null}

        {/* Compact: current page label as a breadcrumb. */}
        {isCompactViewport ? (
          <div className="min-w-0 flex-1 text-sm font-medium text-text-primary truncate">{currentLabel}</div>
        ) : null}

        {/* Primary search / command — palette-first. */}
        {!isCompactViewport ? (
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto w-full max-w-md h-10 px-3.5 rounded-full border border-border bg-bg-surface/70 text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={searchLabel}
            aria-haspopup="dialog"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left text-sm truncate">{searchLabel}</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-bg-base text-[10px] font-mono text-text-muted">Ctrl K</kbd>
          </button>
        ) : null}

        <div className={`flex items-center gap-2 shrink-0 ${isCompactViewport ? "" : "ml-2"}`}>
          {isCompactViewport ? (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast"
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
            className="h-11 lg:h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-mono font-medium tracking-[0.03em] border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
            aria-label={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}
          >
            <Languages className="w-3.5 h-3.5" />
            {i18n.language === "uk" ? "EN" : "UA"}
          </button>

          {/* Desktop account popover. */}
          {!isCompactViewport ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-mono font-semibold flex items-center justify-center hover:bg-primary/25 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={t("accountMenu")}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                title={user.username}
              >
                {avatarLetter}
              </button>
              {accountOpen ? (
                <div
                  className="absolute right-0 top-12 z-40 w-[min(232px,calc(100vw-1rem))] rounded-2xl border border-border bg-bg-surface shadow-[var(--aurora-elev-2)] overflow-hidden"
                  role="menu"
                  aria-label={t("accountMenu")}
                >
                  <div className="px-3.5 py-2.5 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-b border-border truncate">
                    {user.username}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate("profile")}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-primary"
                    role="menuitem"
                  >
                    <UserIcon className="w-4 h-4" />
                    {t("profile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAccountOpen(false); navigate("/docs"); }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary"
                    role="menuitem"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {t("help")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAccountOpen(false); cycleUIMode(); }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary"
                    role="menuitem"
                  >
                    <SwatchBook className="w-4 h-4" />
                    {t("interfaceLabel")}: {currentUIModeName}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAccountOpen(false); onLogout(); }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-accent-error"
                    role="menuitem"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("logout")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Compact overflow menu. */}
          {isCompactViewport ? (
            <div className="relative" ref={mobileMenuRef}>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="w-11 h-11 rounded-xl border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center justify-center"
                aria-label={t("menu")}
                title={t("menu")}
                aria-haspopup="menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="w-5 h-5" />
              </button>
              {mobileMenuOpen ? (
                <div
                  className="absolute right-0 top-12 z-40 w-[min(280px,calc(100vw-1rem))] rounded-2xl border border-border bg-bg-surface shadow-[var(--aurora-elev-2)] overflow-hidden"
                  role="menu"
                  aria-label={t("accountMenu")}
                >
                  {mobileOverflowItems.length ? (
                    <>
                      <div className="px-3.5 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted border-b border-border">
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
                            className="w-full min-h-11 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-primary"
                            role="menuitem"
                          >
                            <Icon className="w-4 h-4" />
                            {it.label}
                          </button>
                        );
                      })}
                    </>
                  ) : null}
                  <div className="px-3.5 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted border-y border-border">
                    {t("account")}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate("profile")}
                    className="w-full min-h-11 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-primary"
                    role="menuitem"
                  >
                    <UserIcon className="w-4 h-4" />
                    {t("profile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); navigate("/docs"); }}
                    className="w-full min-h-11 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary"
                    role="menuitem"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {t("help")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); cycleUIMode(); }}
                    className="w-full min-h-11 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary"
                    role="menuitem"
                  >
                    <SwatchBook className="w-4 h-4" />
                    {t("interfaceLabel")}: {currentUIModeName}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); onLogout(); }}
                    className="w-full min-h-11 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-accent-error"
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

      <div className="flex-1 min-h-0 flex">
        {/* Contextual index-rail: items of the active zone only. */}
        {!isCompactViewport && activeZone ? (
          <aside className="w-[248px] shrink-0 border-r border-border bg-bg-base/40 flex flex-col">
            <div className="px-5 pt-6 pb-2 text-[10px] font-mono font-medium uppercase tracking-[0.1em] text-text-muted">
              {activeZone.label}
            </div>
            <nav className="px-3 pb-4 flex flex-col gap-0.5">
              {activeZone.items.map((it) => {
                const Icon = it.icon;
                const active = current === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleNavigate(it.id)}
                    {...prefetchProps(it.id)}
                    aria-pressed={active}
                    className={
                      "group relative h-11 rounded-xl flex items-center gap-3 pl-4 pr-3 text-left transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 " +
                      (active
                        ? "bg-primary/10 text-primary"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary")
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full bg-primary transition-fast " +
                        (active ? "h-5 opacity-100" : "h-0 opacity-0")
                      }
                    />
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">{it.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col">
          <WorkspaceViewportProvider element={workspaceViewportEl}>
            <div
              ref={setWorkspaceViewportEl}
              className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${isCompactViewport ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]" : ""}`}
            >
              {/* Subtle brand aurora glow behind content (green+blue, brand hues). */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-80"
                  style={{ backgroundImage: "var(--aurora-glow)" }}
                />
                <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
              </div>
              <PlatformFooter compact={isCompactViewport} className="mt-auto" />
            </div>
          </WorkspaceViewportProvider>
        </div>
      </div>

      {/* Mobile primary bar. */}
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
                    "min-h-11 rounded-xl px-1 py-1.5 flex flex-col items-center justify-center gap-1 transition-fast " +
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(id) => handleNavigate(id as MomentumNavTarget)}
        extraActions={paletteActions}
      />
    </div>
  );
};
