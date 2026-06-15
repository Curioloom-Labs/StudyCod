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
  Search,
  Shield,
  SwatchBook,
  Trophy,
  User as UserIcon
} from "lucide-react";
import type { User } from "../../types";
import { Logo } from "../../components/Logo";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { WorkspaceViewportProvider } from "../../components/interface/WorkspaceViewport";
import { CommandPalette, type PaletteAction, type PaletteItem } from "../../components/interface/CommandPalette";
import { useMediaQuery } from "../../utils/useMediaQuery";
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
  zone: "do" | "explore" | "account";
};

/**
 * Aurora shell — a command-driven canvas. There is no persistent sidebar or top
 * nav bar; the only chrome is a single slim command dock floating at the bottom.
 * Navigation happens by command (⌘K palette). Pages render into the full plane
 * above the dock with a single scroll context (no nested scroll chrome).
 */
export const AuroraShell: React.FC<AuroraShellProps> = ({
  user,
  onNavigate,
  onLogout,
  navigationHidden = false,
  topRight,
  children
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ui = useUIMode();
  const isCompact = useMediaQuery("(max-width: 767.98px)");
  const isUk = (i18n.language || "").startsWith("uk");

  const cycleUIMode = () => ui.setMode(nextUIMode(ui.mode));
  const currentUIModeName =
    ui.mode === "aurora" ? t("auroraUiName", { defaultValue: "Aurora" })
    : ui.mode === "focus" ? t("momentumUiName")
    : ui.mode === "nova" ? t("novaUiName", { defaultValue: "Nova" })
    : t("classicUiName");

  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const [workspaceViewportEl, setWorkspaceViewportEl] = React.useState<HTMLDivElement | null>(null);

  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = Boolean(user.studentId);
  const isTeacher = isEducational && !isStudent;
  const homeId: MomentumNavTarget = isEducational && isStudent ? "lessons" : "continue";

  const items = React.useMemo<NavItem[]>(() => [
    { id: homeId, label: isEducational && isStudent ? t("lessons") : t("session"), icon: Home, show: true, zone: "do" },
    { id: "tasks", label: t("tasks"), icon: FileText, show: !isEducational, zone: "do" },
    { id: "grades", label: t("grades"), icon: GraduationCap, show: !isEducational, zone: "do" },
    { id: "student", label: t("myJournal"), icon: BookOpen, show: isEducational && isStudent, zone: "do" },
    { id: "teacher", label: t("myClasses"), icon: GraduationCap, show: isEducational && isTeacher, zone: "do" },
    { id: "library", label: t("library"), icon: Library, show: true, zone: "explore" },
    { id: "contests", label: t("contests", { defaultValue: "Contests" }), icon: Trophy, show: true, zone: "explore" },
    { id: "playground", label: t("playground", { defaultValue: "Playground" }), icon: FlaskConical, show: true, zone: "explore" },
    { id: "learn", label: t("myLearning", { defaultValue: "My Learning" }), icon: Compass, show: isEducational && isStudent, zone: "explore" },
    { id: "admin", label: "Admin", icon: Shield, show: user.role === "SYSTEM_ADMIN", zone: "explore" },
    { id: "support", label: t("support"), icon: HelpCircle, show: true, zone: "explore" },
    { id: "profile", label: t("profile"), icon: UserIcon, show: true, zone: "account" }
  ], [homeId, isEducational, isStudent, isTeacher, t, user.role]);

  const zoneLabel = React.useCallback((zone: NavItem["zone"]) =>
    zone === "do" ? t("novaGroupWorkspace", { defaultValue: isUk ? "Робота" : "Do" })
    : zone === "explore" ? t("novaGroupExplore", { defaultValue: isUk ? "Огляд" : "Explore" })
    : t("account"), [t, isUk]);

  const paletteItems = React.useMemo<PaletteItem[]>(() =>
    items.filter(it => it.show).map(it => ({ id: it.id, label: it.label, icon: it.icon, group: zoneLabel(it.zone) })),
    [items, zoneLabel]);

  const paletteActions = React.useMemo<PaletteAction[]>(() => [
    { id: "help", label: t("help"), icon: HelpCircle, run: () => navigate("/docs") },
    { id: "interface", label: `${t("interfaceLabel")}: ${currentUIModeName}`, icon: SwatchBook, run: cycleUIMode },
    { id: "logout", label: t("logout"), icon: LogOut, danger: true, run: onLogout }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, navigate, onLogout, ui.mode, currentUIModeName]);

  const searchLabel = t("searchOrJump", { defaultValue: isUk ? "Пошук або перехід…" : "Search or jump to…" });

  // ⌘K / Ctrl+K is the primary navigation channel.
  React.useEffect(() => {
    if (navigationHidden) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigationHidden]);

  React.useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const tgt = e.target as Node | null;
      if (!tgt || accountRef.current?.contains(tgt)) return;
      setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAccountOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const go = React.useCallback((target: MomentumNavTarget) => {
    setAccountOpen(false);
    onNavigate(target);
  }, [onNavigate]);

  const avatarLetter = (user.username || "?").charAt(0).toUpperCase();

  if (navigationHidden) {
    return (
      <div data-ui-mode="aurora" className="min-h-[100dvh] bg-bg-base text-text-primary flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <WorkspaceViewportProvider element={workspaceViewportEl}>
            <div ref={setWorkspaceViewportEl} className="flex-1 min-h-0 overflow-y-auto">{children}</div>
          </WorkspaceViewportProvider>
        </div>
      </div>
    );
  }

  return (
    <div data-ui-mode="aurora" className="relative min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      <WorkspaceViewportProvider element={workspaceViewportEl}>
        <div
          ref={setWorkspaceViewportEl}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </div>
      </WorkspaceViewportProvider>

      {/* The Dock — the only persistent chrome. One thin floating bar, bottom-center. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto relative" ref={accountRef}>
          {accountOpen ? (
            <div
              className="absolute bottom-[calc(100%+0.5rem)] right-0 w-[min(248px,calc(100vw-1.5rem))] rounded-2xl border border-border bg-bg-surface shadow-[var(--aurora-elev-2)] overflow-hidden"
              role="menu"
              aria-label={t("accountMenu")}
            >
              <div className="px-3.5 py-2.5 text-xs font-mono font-medium tracking-[0.03em] text-text-secondary border-b border-border truncate">
                {user.username}
              </div>
              <button type="button" onClick={() => go("profile")} className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-primary" role="menuitem">
                <UserIcon className="w-4 h-4" /> {t("profile")}
              </button>
              <button type="button" onClick={() => { setAccountOpen(false); navigate("/docs"); }} className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary" role="menuitem">
                <HelpCircle className="w-4 h-4" /> {t("help")}
              </button>
              <button type="button" onClick={() => { setAccountOpen(false); i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk"); }} className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary" role="menuitem">
                <Languages className="w-4 h-4" /> {i18n.language === "uk" ? "English" : "Українська"}
              </button>
              <button type="button" onClick={() => { setAccountOpen(false); cycleUIMode(); }} className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-text-secondary" role="menuitem">
                <SwatchBook className="w-4 h-4" /> {t("interfaceLabel")}: {currentUIModeName}
              </button>
              <button type="button" onClick={() => { setAccountOpen(false); onLogout(); }} className="w-full min-h-10 px-3.5 py-2 text-left text-sm font-medium hover:bg-bg-hover transition-fast flex items-center gap-2.5 text-accent-error" role="menuitem">
                <LogOut className="w-4 h-4" /> {t("logout")}
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 rounded-full border border-border bg-bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/75 p-1.5 shadow-[var(--aurora-elev-1)]">
            <button
              type="button"
              onClick={() => go(homeId)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-bg-hover transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title="StudyCod"
              aria-label={t("goToSession")}
            >
              <Logo size={18} />
            </button>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="h-9 px-3.5 rounded-full flex items-center gap-2.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={searchLabel}
              aria-haspopup="dialog"
            >
              <Search className="w-4 h-4 shrink-0" />
              {!isCompact ? <span className="text-sm w-40 text-left truncate">{searchLabel}</span> : null}
              <kbd className="hidden sm:inline px-1.5 py-0.5 rounded border border-border bg-bg-base text-[10px] font-mono text-text-muted">⌘K</kbd>
            </button>

            {topRight ? <div className="flex items-center">{topRight}</div> : null}

            <button
              type="button"
              onClick={() => setAccountOpen(v => !v)}
              className="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-mono font-semibold flex items-center justify-center hover:bg-primary/25 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={t("accountMenu")}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              title={user.username}
            >
              {avatarLetter}
            </button>
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(id) => go(id as MomentumNavTarget)}
        extraActions={paletteActions}
      />
    </div>
  );
};
