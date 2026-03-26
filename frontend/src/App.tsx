import React, { useEffect, useState, Suspense, useCallback, useMemo, useRef, startTransition } from "react";
import { Routes, Route, useLocation, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { getMe } from "./lib/api/profile";
import type { User } from "./types";
import { Code2, User as UserIcon, FileText, Home, Menu, X, GraduationCap, BookOpen, Shield, HelpCircle, Library, SunMoon } from "lucide-react";
import { Button } from "./components/ui/Button";
import { Logo } from "./components/Logo";
import { useTranslation } from "react-i18next";
import { AnimatedPage } from "./components/layout/AnimatedPage";
import { staggerContainer, fadeUpItem } from "./lib/motion";
import { TerminalLoader } from "./components/ui/TerminalLoader";
import { DocsPage, MaintenancePage, type MaintenancePayload } from "./pages/system";
import { OnboardingEntry } from "./components/onboarding/OnboardingEntry";
import { PlacementEntry } from "./components/placement/PlacementEntry";
import { UIModeProvider, useUIMode } from "./components/interface/UIModeProvider";
import { SwitchToMomentumNudge } from "./components/interface/SwitchToMomentumNudge";
import { WorkspaceViewportProvider } from "./components/interface/WorkspaceViewport";
import { MomentumShell, type MomentumNavTarget } from "./layout/momentum/MomentumShell";
import { isResumableSession, loadResumeState, resolveResumeRoute } from "./lib/resumeState";
import { applyTheme, getCurrentTheme, type AppTheme } from "./theme";
import { getMaintenanceStatus } from "./lib/api/maintenance";
import { getAdminMaintenance } from "./lib/api/admin";
import { exchangeGoogleCode, exchangeGoogleCookie } from "./lib/api/auth";
import { TheoryModalProvider } from "./components/theory/TheoryModalProvider";
import { ToastViewport } from "./components/ui/ToastViewport";
import { PublicLandingPage } from "./pages/public";
import { getErrorMessageFromUnknown } from "./lib/safeError";
const AuthPage = React.lazy(() => import("./pages/auth").then(mod => ({
  default: mod.AuthPage
})));
const VerifyEmailPage = React.lazy(() => import("./pages/auth").then(mod => ({
  default: mod.VerifyEmailPage
})));
const ResetPasswordPage = React.lazy(() => import("./pages/auth").then(mod => ({
  default: mod.ResetPasswordPage
})));
const TasksPage = React.lazy(() => import("./pages/core").then(mod => ({
  default: mod.TasksPage
})));
const GradesPage = React.lazy(() => import("./pages/core").then(mod => ({
  default: mod.GradesPage
})));
const ProfilePage = React.lazy(() => import("./pages/profile").then(mod => ({
  default: mod.ProfilePage
})));
const HomePage = React.lazy(() => import("./pages/core").then(mod => ({
  default: mod.HomePage
})));
const PublicProfilePage = React.lazy(() => import("./pages/public").then(mod => ({
  default: mod.PublicProfilePage
})));
const IadPage = React.lazy(() => import("./pages/core").then(mod => ({
  default: mod.IadPage
})));
const EmailPreferencesResultPage = React.lazy(() => import("./pages/auth").then(mod => ({
  default: mod.EmailPreferencesResultPage
})));
const TeacherDashboardPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.TeacherDashboardPage
})));
const ClassDetailsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.ClassDetailsPage
})));
const CreateLessonPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.CreateLessonPage
})));
const CreateTopicPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.CreateTopicPage
})));
const TopicDetailsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.TopicDetailsPage
})));
const ControlWorkDetailsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.ControlWorkDetailsPage
})));
const StudentDashboardPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.StudentDashboardPage
})));
const StudentLessonsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.StudentLessonsPage
})));
const LessonDetailsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.LessonDetailsPage
})));
const StudentTaskPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.StudentTaskPage
})));
const GradeDetailsPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.GradeDetailsPage
})));
const SummaryGradesPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.SummaryGradesPage
})));
const ClassGradebookPage = React.lazy(() => import("./pages/edu").then(mod => ({
  default: mod.ClassGradebookPage
})));
const GoogleAuthCompletePage = React.lazy(() => import("./pages/auth").then(mod => ({
  default: mod.GoogleAuthCompletePage
})));
const AdminDashboardPage = React.lazy(() => import("./pages/system").then(mod => ({
  default: mod.AdminDashboardPage
})));
const SupportPage = React.lazy(() => import("./pages/system").then(mod => ({
  default: mod.SupportPage
})));
const ProfileCertificatesPage = React.lazy(() => import("./pages/profile").then(mod => ({
  default: mod.ProfileCertificatesPage
})));
const CertificateVerifyPage = React.lazy(() => import("./pages/public").then(mod => ({
  default: mod.CertificateVerifyPage
})));
const TaskLibraryPage = React.lazy(() => import("./pages/library").then(mod => ({
  default: mod.TaskLibraryPage
})));
const LibraryTaskSolvePage = React.lazy(() => import("./pages/library").then(mod => ({
  default: mod.LibraryTaskSolvePage
})));
const ContestsPage = React.lazy(() => import("./pages/contest").then(mod => ({
  default: mod.ContestsPage
})));
const ContestPage = React.lazy(() => import("./pages/contest").then(mod => ({
  default: mod.ContestPage
})));
const ContestProblemSolvePage = React.lazy(() => import("./pages/contest").then(mod => ({
  default: mod.ContestProblemSolvePage
})));
const DevEditorPage = React.lazy(() => import("./pages/system").then(mod => ({
  default: mod.DevEditorPage
})));
const PageLoader: React.FC = () => {
  const {
    t
  } = useTranslation();
  return <div className="h-screen flex items-center justify-center text-text-primary font-mono bg-bg-base">
      <TerminalLoader label={t("loading")} sublabel="StudyCod EDU" />
    </div>;
};
type Page = "home" | "tasks" | "grades" | "profile" | "teacher" | "student" | "admin";

type MaintenanceStoragePayload = {
  title?: unknown;
  message?: unknown;
  until?: unknown;
};

type MaintenanceEventDetail = {
  maintenance?: boolean;
  title?: string;
  message?: string;
  until?: string | null;
};

type AdminMaintenanceEventDetail = {
  enabled?: boolean;
};

type MaintenanceApiData = {
  maintenance: boolean;
  title?: unknown;
  message?: unknown;
  until?: unknown;
};

const extractMaintenanceData = (error: unknown): { status: number | null; data: MaintenanceApiData | null } => {
  if (!error || typeof error !== "object") {
    return { status: null, data: null };
  }

  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") {
    return { status: null, data: null };
  }

  const statusRaw = Reflect.get(response, "status");
  const status = typeof statusRaw === "number" ? statusRaw : null;

  const dataRaw = Reflect.get(response, "data");
  if (!dataRaw || typeof dataRaw !== "object") {
    return { status, data: null };
  }

  const maintenanceRaw = Reflect.get(dataRaw, "maintenance");
  const data: MaintenanceApiData = {
    maintenance: maintenanceRaw === true,
    title: Reflect.get(dataRaw, "title"),
    message: Reflect.get(dataRaw, "message"),
    until: Reflect.get(dataRaw, "until"),
  };

  return { status, data };
};

function asPage(value: string): Page | null {
  return value === "home" || value === "tasks" || value === "grades" || value === "profile" || value === "teacher" || value === "student" || value === "admin" ? value : null;
}

function toMomentumPageTarget(value: MomentumNavTarget): Page | null {
  return asPage(value);
}

const AppContent: React.FC = React.memo(() => {
  const {
    t,
    i18n
  } = useTranslation();
  const ui = useUIMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const [workspaceViewportEl, setWorkspaceViewportEl] = useState<HTMLElement | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenancePayload | null>(() => {
    try {
      const raw = sessionStorage.getItem("studycod.maintenance");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MaintenanceStoragePayload;
      if (parsed && parsed.title && parsed.message) {
        return {
          title: String(parsed.title),
          message: String(parsed.message),
          until: parsed.until ? String(parsed.until) : null
        };
      }
      return null;
    } catch {
      return null;
    }
  });
  const [maintenanceChecked, setMaintenanceChecked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("studycod.maintenance") != null;
    } catch {
      return false;
    }
  });
  const [adminMaintenanceEnabled, setAdminMaintenanceEnabled] = useState<boolean>(false);
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [bootResumeHandled, setBootResumeHandled] = useState<boolean>(false);
  useEffect(() => {
    const cleanupOldStorage = () => {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      keys.forEach(key => {
        if (key.startsWith("quiz_") || key.startsWith("task_")) {
          const timestampKey = `${key}_timestamp`;
          const timestamp = localStorage.getItem(timestampKey);
          if (timestamp) {
            const age = now - parseInt(timestamp, 10);
            if (age > maxAge) {
              localStorage.removeItem(key);
              localStorage.removeItem(timestampKey);
            }
          } else {
            localStorage.removeItem(key);
          }
        }
      });
    };
    cleanupOldStorage();
    const interval = setInterval(cleanupOldStorage, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    // Allow cross-area navigation (e.g., from /edu) to request a specific page.
    try {
      const requested = sessionStorage.getItem("studycod.openPage");
      if (!requested) return;
      const next = asPage(requested);
      if (next) {
        startTransition(() => setPage(next));
      }
      sessionStorage.removeItem("studycod.openPage");
    } catch {
      // ignore
    }
  }, [user?.id]);
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const d = (e.detail ?? null) as MaintenanceEventDetail | null;
      if (d && d.maintenance === true) {
        setMaintenance({
          title: String(d.title ?? "Технічне обслуговування"),
          message: String(d.message ?? ""),
          until: d.until ? String(d.until) : null
        });
        setMaintenanceChecked(true);
      }
    };
    window.addEventListener("studycod:maintenance", handler as EventListener);
    return () => window.removeEventListener("studycod:maintenance", handler as EventListener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let checked = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const s = await getMaintenanceStatus();
          if (cancelled) return;
          if (s.maintenance) {
            setMaintenance({
              title: s.title,
              message: s.message,
              until: s.until
            });
          } else {
            setMaintenance(null);
            try {
              sessionStorage.removeItem("studycod.maintenance");
            } catch {}
          }
          checked = true;
          break;
        } catch (err) {
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 1200));
            continue;
          }
          console.warn("[app] maintenance status fetch failed", err);
        }
      }
      if (!cancelled && !checked) {
        // Even if check failed, unblock app boot and rely on runtime maintenance events.
        checked = true;
      }
      if (!cancelled && checked) {
        setMaintenanceChecked(true);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const detail = (e.detail ?? null) as AdminMaintenanceEventDetail | null;
      const enabled = !!detail?.enabled;
      setAdminMaintenanceEnabled(enabled);
    };
    window.addEventListener("studycod:adminMaintenance", handler as EventListener);
    return () => window.removeEventListener("studycod:adminMaintenance", handler as EventListener);
  }, []);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setBootResumeHandled(true);
      setLoading(false);
      return;
    }
    getMe().then(u => {
      setUser(u);
      if (u.userMode === "CONTEST") {
        navigate("/contest/contests", { replace: true });
        setBootResumeHandled(true);
        return;
      }
      const fromAuth = sessionStorage.getItem("fromAuth");
      if (fromAuth && u.role === "SYSTEM_ADMIN") {
        startTransition(() => {
          setPage("admin");
        });
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && (!u.userMode || u.userMode === "PERSONAL")) {
        // Post-auth routing must be presentation-agnostic.
        const resume = resolveResumeRoute(u, loadResumeState(u.id));
        if (resume.type === "path") {
          navigate(resume.path, { replace: true });
        } else if (resume.type === "appPage") {
          if (resume.extras?.openTaskId) {
            sessionStorage.setItem("openTaskId", resume.extras.openTaskId);
          }
          startTransition(() => setPage(resume.page));
        }
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && u.userMode === "EDUCATIONAL" && u.studentId) {
        const resume = resolveResumeRoute(u, loadResumeState(u.id));
        if (resume.type === "path") {
          navigate(resume.path, { replace: true });
        } else if (resume.type === "appPage") {
          startTransition(() => setPage(resume.page));
        }
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && u.userMode === "EDUCATIONAL" && !u.studentId) {
        const resume = resolveResumeRoute(u, loadResumeState(u.id));
        if (resume.type === "path") {
          navigate(resume.path, { replace: true });
        } else if (resume.type === "appPage") {
          startTransition(() => setPage(resume.page));
        }
        sessionStorage.removeItem("fromAuth");
      } else {
        // Boot-time resume: when opening the app root without an explicit intent,
        // restore the last valid cognitive session immediately.
        try {
          const path = window.location.pathname;
          const sp = new URLSearchParams(window.location.search);
          const authIntent = sp.get("auth");
          const nextAfterAuth = sp.get("next");
          const requestedPage = sessionStorage.getItem("studycod.openPage");

          const isRootEntry = path === "/";
          const hasExplicitIntent = Boolean(authIntent || nextAfterAuth || requestedPage);

          if (isRootEntry && !hasExplicitIntent) {
            const state = loadResumeState(u.id);
            if (isResumableSession(u, state)) {
              const resolved = resolveResumeRoute(u, state);
              if (resolved.type === "path") {
                navigate(resolved.path, { replace: true });
              } else if (resolved.type === "appPage") {
                if (resolved.extras?.openTaskId) {
                  sessionStorage.setItem("openTaskId", resolved.extras.openTaskId);
                }
                startTransition(() => setPage(resolved.page));
              }
            }
          }
        } catch {
          // ignore
        }
      }
      setBootResumeHandled(true);
    }).catch(error => {
      const extracted = extractMaintenanceData(error);
      const isMaintenance = extracted.status === 503 && extracted.data?.maintenance === true;
      if (isMaintenance) {
        const d = extracted.data;
        if (!d) {
          setBootResumeHandled(true);
          return;
        }
        setMaintenance({
            title: String(d.title ?? t("maintenanceTitle")),
          message: String(d.message ?? ""),
          until: d.until ? String(d.until) : null
        });
        return;
      }
      if (import.meta.env.DEV) {
        console.error("Failed to get user:", getErrorMessageFromUnknown(error, "unknown error"));
      }
      localStorage.removeItem("token");
      setUser(null);
      setBootResumeHandled(true);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user || user.role !== "SYSTEM_ADMIN") return;
    getAdminMaintenance().then(r => setAdminMaintenanceEnabled(!!r.state?.enabled)).catch(() => setAdminMaintenanceEnabled(false));
  }, [user?.role]);
  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    startTransition(() => {
      setUser(null);
      setPage("home");
    });
  }, []);
  const handleSetPage = useCallback((newPage: Page) => {
    startTransition(() => {
      setPage(newPage);
    });
    setNavOpen(false);
  }, []);
  const handleGoHome = useCallback(() => {
    startTransition(() => {
      setPage("home");
    });
    setNavOpen(false);
  }, []);

  const handleGoHomeOrResume = useCallback(() => {
    if (!user) {
      startTransition(() => setPage("home"));
      return;
    }
    const state = loadResumeState(user.id);
    if (isResumableSession(user, state)) {
      const resolved = resolveResumeRoute(user, state);
      if (resolved.type === "path") {
        navigate(resolved.path);
        return;
      }
      if (resolved.type === "appPage") {
        if (resolved.extras?.openTaskId) {
          sessionStorage.setItem("openTaskId", resolved.extras.openTaskId);
        }
        startTransition(() => setPage(resolved.page));
        return;
      }
    }

    // No resumable session: show entry surface.
    startTransition(() => setPage("home"));
  }, [user?.id]);
  const handleToggleNav = useCallback(() => {
    setNavOpen(prev => !prev);
  }, []);
  useEffect(() => {
    if (!navOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (navMenuRef.current?.contains(target)) return;
      setNavOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
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
  }, [navOpen]);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);
  const courseLabel = useMemo(() => {
    if (!user) return "Java";
    return user.course === "JAVA" ? "Java" : user.course === "PYTHON" ? "Python" : "C++";
  }, [user?.course]);
  const userModeLabel = useMemo(() => {
    if (!user) return "Personal";
    if (user.userMode === "EDUCATIONAL") return "EDU";
    if (user.userMode === "CONTEST") return "Contest";
    return "Personal";
  }, [user?.userMode]);

  const setWorkspaceViewportRef = useCallback((el: HTMLElement | null) => {
    setWorkspaceViewportEl(el);
  }, []);

  if (!maintenanceChecked) {
    return <div className="h-screen flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  if (loading) {
    return <div className="h-screen flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }

  if (user && !bootResumeHandled) {
    return <div className="h-screen flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  if (!user) {
    if (maintenance && !showAdminLogin) {
      return <MaintenancePage state={maintenance} onAdminLogin={() => {
        startTransition(() => setShowAdminLogin(true));
      }} onRetry={() => {
        window.location.reload();
      }} />;
    }

    const authIntent = searchParams.get("auth");
    const wantsAuth = authIntent === "login" || authIntent === "register";
    const showLanding = location.pathname === "/" && !wantsAuth;
    if (showLanding) {
      return <PublicLandingPage />;
    }

    const nextAfterAuth = searchParams.get("next");
    return <Suspense fallback={<PageLoader />}>
      <AuthPage initialMode={authIntent === "register" ? "register" : "login"} showBackToLanding={location.pathname === "/"} onAuth={(u: User) => {
        setUser(u);
        setBootResumeHandled(true);
        sessionStorage.setItem("fromAuth", "true");
        if (nextAfterAuth) {
          navigate(nextAfterAuth, {
            replace: true
          });
        }
      }} />
      </Suspense>;
  }
  if (maintenance && user.role !== "SYSTEM_ADMIN") {
    return <MaintenancePage state={maintenance} onRetry={() => {
      window.location.reload();
    }} />;
  }
  const content = <Suspense fallback={<PageLoader />}>
      {(() => {
      if (page === "admin" && user.role === "SYSTEM_ADMIN") return <AdminDashboardPage />;
      if (page === "home") {
        return <HomePage user={user} onNavigate={handleSetPage} />;
      }
      if (page === "tasks" && user.userMode !== "EDUCATIONAL") return <TasksPage user={user} />;
      if (page === "grades" && user.userMode !== "EDUCATIONAL") return <GradesPage onNavigate={handleSetPage} />;
      if (page === "teacher" && user.userMode === "EDUCATIONAL" && !user.studentId) return <TeacherDashboardPage />;
      if (page === "student" && user.userMode === "EDUCATIONAL") return <StudentDashboardPage user={user} />;
      if (page === "profile") return <ProfilePage user={user} onUserChange={setUser} />;
      return null;
    })()}
    </Suspense>;

  if (ui.mode === "classic") {
    return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
        {}
        <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo size={24} className="text-primary" />
              <span className="text-lg font-mono text-text-primary">StudyCod</span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="px-3 py-1 border border-border text-sm font-mono text-text-secondary">
              {courseLabel}
            </div>
            {user.userMode && <>
                <div className="h-6 w-px bg-border" />
                <div className="px-3 py-1 border border-border text-sm font-mono text-text-secondary">
                  {userModeLabel}
                </div>
              </>}
          </div>

          <div className="flex items-center gap-2">
            {user.role === "SYSTEM_ADMIN" && adminMaintenanceEnabled && <div className="px-3 py-1 border border-amber-400/60 bg-amber-400/10 text-amber-200 text-xs font-mono">
                {t("maintenanceModeEnabled")}
              </div>}
            {}
            {(!user.userMode || user.userMode === "PERSONAL") && <>
                <button onClick={handleGoHome} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "home" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <Home className="w-4 h-4" />
                  {t('home')}
                </button>
                <button onClick={() => handleSetPage("tasks")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "tasks" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <FileText className="w-4 h-4" />
                  {t('tasks')}
                </button>
                <button onClick={() => handleSetPage("grades")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "grades" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <FileText className="w-4 h-4" />
                  {t('grades')}
                </button>
                <button onClick={() => navigate("/library")} className="px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary">
                  <Library className="w-4 h-4" />
                  {t("library")}
                </button>
              </>}

            <button onClick={() => navigate("/docs")} className="px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <HelpCircle className="w-4 h-4" />
              {t("help")}
            </button>

            <button onClick={() => navigate("/support")} className="px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <HelpCircle className="w-4 h-4" />
              {t("support")}
            </button>

            {}
            {user.role === "SYSTEM_ADMIN" && <button onClick={() => handleSetPage("admin")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "admin" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                <Shield className="w-4 h-4" />
                Admin
              </button>}

            {}
            {user.userMode === "EDUCATIONAL" && !user.studentId && <button onClick={() => handleSetPage("teacher")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "teacher" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                <GraduationCap className="w-4 h-4" />
                {t('myClasses')}
              </button>}

            {user.userMode === "EDUCATIONAL" && user.studentId && <>
                <button onClick={() => handleSetPage("student")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "student" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <BookOpen className="w-4 h-4" />
                  {t('myJournal')}
                </button>
                <button onClick={() => navigate("/edu/library")} className="px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                  <Library className="w-4 h-4" />
                  {t("library")}
                </button>
                <button onClick={() => {
              navigate("/edu/lessons");
            }} className="px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t('lessons')}
                </button>
              </>}

            <div className="h-6 w-px bg-border mx-2" />

            {}
            <div className="flex items-center gap-2">
              {}
              <button onClick={() => i18n.changeLanguage(i18n.language === 'uk' ? 'en' : 'uk')} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={i18n.language === 'uk' ? t('switchToEnglish') : t('switchToUkrainian')}>
                {i18n.language === 'uk' ? 'EN' : 'UA'}
              </button>

              {}
              <button onClick={toggleTheme} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              
              <button onClick={() => handleSetPage("profile")} className={`w-8 h-8 border flex items-center justify-center hover:bg-bg-hover transition-fast ${page === "profile" ? "border-primary" : "border-border"}`} title={t('profile')}>
                <UserIcon className="w-4 h-4 text-text-secondary" />
              </button>
              <div className="relative" ref={navMenuRef}>
                <button onClick={handleToggleNav} className="w-8 h-8 border border-border flex items-center justify-center hover:bg-bg-hover transition-fast" title={t('menu')}>
                  {navOpen ? <X className="w-4 h-4 text-text-secondary" /> : <Menu className="w-4 h-4 text-text-secondary" />}
                </button>
                {navOpen && <>
                    <div className="absolute right-0 top-10 z-40 bg-bg-surface border border-border min-w-[180px]">
                      <nav className="flex flex-col">
                        <button onClick={handleLogout} className="px-4 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-accent-error">
                          {t('logout')}
                        </button>
                      </nav>
                    </div>
                  </>}
              </div>
            </div>
          </div>
        </header>

        <SwitchToMomentumNudge />

        {}
        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <main ref={setWorkspaceViewportRef} className={`flex-1 min-h-0 flex flex-col ${page === "tasks" && user.userMode !== "EDUCATIONAL" ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
            {content}
          </main>
        </WorkspaceViewportProvider>
        {user ? <PlacementEntry user={user} onUserChange={setUser} /> : null}
        <OnboardingEntry />
      </div>;
  }

      const momentumCurrent: MomentumNavTarget = page === "home" ? "continue" : page;
  return <>
      <MomentumShell user={user} current={momentumCurrent} onNavigate={target => {
      if (target === "library") {
        if (user.userMode === "EDUCATIONAL" && user.studentId) {
          navigate("/edu/library");
        } else {
          navigate("/library");
        }
        return;
      }
      if (target === "support") {
        navigate("/support");
        return;
      }
      if (target === "contests") {
        navigate("/contests");
        return;
      }
      if (target === "continue") {
        handleGoHomeOrResume();
        return;
      }
      const pageTarget = toMomentumPageTarget(target);
      if (pageTarget) {
        handleSetPage(pageTarget);
      }
        }} onLogout={handleLogout} topRight={<button onClick={toggleTheme} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
          <SunMoon className="w-3.5 h-3.5" />
          {theme === "dark" ? "Light" : "Dark"}
          </button>}>
        {content}
      </MomentumShell>
      {user ? <PlacementEntry user={user} onUserChange={setUser} /> : null}
      <OnboardingEntry />
    </>;
});
AppContent.displayName = "AppContent";
export const App: React.FC = () => {
  const location = useLocation();
  return <TheoryModalProvider>
      <UIModeProvider>
        <ToastViewport />
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
          {import.meta.env.DEV ? <Route path="/__dev/editor" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <DevEditorPage />
                </AnimatedPage>
              </Suspense>} /> : null}
          <Route path="/verify-email" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <VerifyEmailWrapper />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/auth/reset-password" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <ResetPasswordPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/auth/google/complete" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <GoogleAuthWrapper />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/auth/google/success" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <GoogleAuthSuccessWrapper />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/auth/google/error" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <GoogleAuthErrorPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/docs" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <DocsPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/support" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <SupportPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/profile/certificates" element={<RequireToken>
                <Suspense fallback={<PageLoader />}>
                  <AnimatedPage>
                    <ProfileCertificatesPage />
                  </AnimatedPage>
                </Suspense>
              </RequireToken>} />
          <Route path="/certificate/:certificateId" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <CertificateVerifyPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/library" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <TaskLibraryPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/library/solve/:taskKey" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <LibraryTaskSolvePage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/contests" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <ContestsPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/contests/:id" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <ContestPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/contests/:id/problems/:problemId" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <ContestProblemSolvePage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/u/:username" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <PublicProfilePage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/iad" element={<RequireToken>
                <Suspense fallback={<PageLoader />}>
                  <AnimatedPage>
                    <IadPage />
                  </AnimatedPage>
                </Suspense>
              </RequireToken>} />
          <Route path="/difus" element={<RequireToken>
                <Suspense fallback={<PageLoader />}>
                  <AnimatedPage>
                    <IadPage />
                  </AnimatedPage>
                </Suspense>
              </RequireToken>} />
          <Route path="/email-preferences" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <EmailPreferencesResultPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/edu/*" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <EduRoutes />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/contest/*" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <ContestRoutes />
                </AnimatedPage>
              </Suspense>} />
            <Route path="*" element={<AppContent />} />
          </Routes>
        </AnimatePresence>
      </UIModeProvider>
    </TheoryModalProvider>;
};

const RequireToken: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const token = (() => {
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  })();

  if (!token) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/?auth=login&next=${next}`} replace />;
  }
  return <>{children}</>;
};

type JwtUserPayload = {
  userId?: number;
  userMode?: "PERSONAL" | "EDUCATIONAL" | "CONTEST";
  type?: "USER" | "STUDENT";
};

function decodeJwtPayload(token: string | null): JwtUserPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as JwtUserPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const ContestRoutes: React.FC = React.memo(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const payload = decodeJwtPayload(token);
    if (!token || !payload || payload.type === "STUDENT") {
      setUser(null);
      setReady(true);
      return;
    }
    if (payload.userMode !== "CONTEST") {
      navigate("/", { replace: true });
      return;
    }
    setUser({
      id: payload.userId ?? 0,
      username: "contest-user",
      course: "JAVA",
      iad: 0,
      avatarUrl: null,
      userMode: "CONTEST",
    });
    setReady(true);
  }, [navigate]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  if (!ready) return <PageLoader />;

  if (!user) {
    return <Suspense fallback={<PageLoader />}>
      <AuthPage
        initialMode="login"
        initialUserMode="CONTEST"
        onAuth={(u) => {
          if (u.userMode !== "CONTEST") {
            navigate("/", { replace: true });
            return;
          }
          navigate("/contest/contests", { replace: true });
          window.location.reload();
        }}
      />
      </Suspense>;
  }

  return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Logo size={24} className="text-primary" />
          <span className="text-lg font-mono text-text-primary">StudyCod Contest</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}>
            {i18n.language === "uk" ? "EN" : "UA"}
          </button>
          <button onClick={toggleTheme} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={() => {
          localStorage.removeItem("token");
          navigate("/contest", { replace: true });
          window.location.reload();
        }} className="px-3 py-1 text-xs font-mono border border-border text-accent-error hover:bg-bg-hover transition-fast">
            {t("logout")}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route index element={<Navigate to="contests" replace />} />
              <Route path="contests" element={<AnimatedPage><ContestsPage /></AnimatedPage>} />
              <Route path="contests/:id" element={<AnimatedPage><ContestPage /></AnimatedPage>} />
              <Route path="contests/:id/problems/:problemId" element={<AnimatedPage><ContestProblemSolvePage /></AnimatedPage>} />
              <Route path="*" element={<Navigate to="contests" replace />} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>
    </div>;
});
ContestRoutes.displayName = "ContestRoutes";

const EduRoutes: React.FC = React.memo(() => {
  const {
    t,
    i18n
  } = useTranslation();
  const ui = useUIMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
  const [workspaceViewportEl, setWorkspaceViewportEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe().then(u => {
      if (u.userMode !== "EDUCATIONAL") {
        navigate("/", {
          replace: true
        });
        return;
      }
      setUser(u);
    }).catch(error => {
      if (import.meta.env.DEV) {
        console.error("EduRoutes: Failed to get user", error);
      }
      localStorage.removeItem("token");
      setUser(null);
    }).finally(() => setLoading(false));
  }, [navigate]);
  const handleAuth = useCallback((u: User) => {
    setUser(u);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);
  const courseLabel = useMemo(() => {
    if (!user) return "Java";
    return user.course === "JAVA" ? "Java" : user.course === "PYTHON" ? "Python" : "C++";
  }, [user?.course]);

  const setEduWorkspaceViewportRef = useCallback((el: HTMLElement | null) => {
    setWorkspaceViewportEl(el);
  }, []);

  if (loading) {
    return <PageLoader />;
  }
  if (!user) {
    return <Suspense fallback={<PageLoader />}>
        <AuthPage onAuth={handleAuth} />
      </Suspense>;
  }
  const eduMain = <main className={`flex-1 min-h-0 flex flex-col ${/^\/tasks\//.test(location.pathname) ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {}
            <Route index element={user.studentId ? <Navigate to="lessons" replace /> : <AnimatedPage>
                    <TeacherDashboardPage />
                  </AnimatedPage>} />
            <Route path="classes/:classId" element={<AnimatedPage><ClassDetailsPage /></AnimatedPage>} />
            <Route path="classes/:classId/lessons/new" element={<AnimatedPage><CreateLessonPage /></AnimatedPage>} />
            <Route path="classes/:classId/topics/new" element={<AnimatedPage><CreateTopicPage /></AnimatedPage>} />
            <Route path="topics/:topicId" element={<AnimatedPage><TopicDetailsPage /></AnimatedPage>} />
            <Route path="library" element={<AnimatedPage><TaskLibraryPage /></AnimatedPage>} />
            <Route path="library/solve/:taskKey" element={<AnimatedPage><LibraryTaskSolvePage /></AnimatedPage>} />
            <Route path="control-works/:controlWorkId" element={<AnimatedPage><ControlWorkDetailsPage /></AnimatedPage>} />
            <Route path="/classes/:classId/summary-grades" element={<AnimatedPage><SummaryGradesPage /></AnimatedPage>} />
            <Route path="/classes/:classId/gradebook" element={<AnimatedPage><ClassGradebookPage /></AnimatedPage>} />
            <Route path="/lessons" element={<AnimatedPage><StudentLessonsPage /></AnimatedPage>} />
            <Route path="/lessons/:lessonId" element={<AnimatedPage><LessonDetailsPage /></AnimatedPage>} />
            <Route path="/tasks/:taskId" element={<AnimatedPage><StudentTaskPage /></AnimatedPage>} />
            <Route path="/grades/:gradeId" element={<AnimatedPage><GradeDetailsPage /></AnimatedPage>} />
            <Route path="/docs" element={<AnimatedPage><DocsPage /></AnimatedPage>} />
            {}
            <Route path="*" element={<Navigate to={user.studentId ? "lessons" : ""} replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </main>;

  if (ui.mode === "classic") {
    return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
        <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo size={24} className="text-primary" />
              <span className="text-lg font-mono text-text-primary">StudyCod EDU</span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="px-3 py-1 border border-border text-sm font-mono text-text-secondary">
              {courseLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => i18n.changeLanguage(i18n.language === 'uk' ? 'en' : 'uk')} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={i18n.language === 'uk' ? t('switchToEnglish') : t('switchToUkrainian')}>
              {i18n.language === 'uk' ? 'EN' : 'UA'}
            </button>
            <button onClick={toggleTheme} className="px-3 py-1 text-xs font-mono border border-border hover:bg-bg-hover transition-fast" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button onClick={() => navigate("/docs")} className="px-4 py-2 border border-border text-sm font-mono hover:bg-bg-hover transition-fast flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              {t("help")}
            </button>
            <button onClick={() => navigate("/")} className="px-4 py-2 border border-border text-sm font-mono hover:bg-bg-hover transition-fast">
              {t('toHome')}
            </button>
          </div>
        </header>

        <SwitchToMomentumNudge />
        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <div ref={setEduWorkspaceViewportRef} className="flex-1 min-h-0 overflow-y-auto">
            {eduMain}
          </div>
        </WorkspaceViewportProvider>
        <OnboardingEntry />
      </div>;
  }

  const momentumCurrent: MomentumNavTarget = /^\/edu\/library/.test(location.pathname)
    ? "library"
    : "continue";
  return <>
      <MomentumShell user={user} current={momentumCurrent} onNavigate={target => {
      if (target === "library") {
        navigate("/edu/library");
        return;
      }
      if (target === "support") {
        navigate("/support");
        return;
      }
      if (target === "contests") {
        navigate("/contests");
        return;
      }
      if (target === "profile") {
        try {
          sessionStorage.setItem("studycod.openPage", "profile");
        } catch {}
        navigate("/");
        return;
      }
      if (target === "teacher") {
        navigate("/edu");
        return;
      }
      if (target === "student" || target === "continue") {
        navigate("/edu/lessons");
        return;
      }
    }} onLogout={() => {
      localStorage.removeItem("token");
      navigate("/");
    }} topRight={<button onClick={toggleTheme} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
            <SunMoon className="w-3.5 h-3.5" />
            {theme === "dark" ? "Light" : "Dark"}
          </button>}>
        {eduMain}
      </MomentumShell>
      <OnboardingEntry />
    </>;
});
EduRoutes.displayName = "EduRoutes";
const VerifyEmailWrapper: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const handleAuth = useCallback((u: User) => {
    navigate("/");
  }, [navigate]);
  return <Suspense fallback={<PageLoader />}>
      <VerifyEmailPage onAuth={handleAuth} />
    </Suspense>;
});
VerifyEmailWrapper.displayName = "VerifyEmailWrapper";
const GoogleAuthWrapper: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const handleAuth = useCallback((user: User) => {
    sessionStorage.setItem("fromAuth", "true");
    navigate("/");
    window.location.reload();
  }, [navigate]);
  return <GoogleAuthCompletePage onAuth={handleAuth} />;
});
GoogleAuthWrapper.displayName = "GoogleAuthWrapper";
const GoogleAuthSuccessWrapper: React.FC = React.memo(() => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const code = searchParams.get("code");
  const isLikelyJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
  useEffect(() => {
    let cancelled = false;
    const finishSuccess = (jwtToken: string) => {
      localStorage.setItem("token", jwtToken);
      sessionStorage.setItem("fromAuth", "true");
      window.location.replace("/");
    };

    const run = async () => {
      if (code) {
        try {
          const exchanged = await exchangeGoogleCode(code, "success");
          if (cancelled) return;
          if (exchanged.token && isLikelyJwt(exchanged.token)) {
            finishSuccess(exchanged.token);
            return;
          }
          localStorage.removeItem("token");
          window.location.replace("/");
          return;
        } catch {
          if (cancelled) return;
          localStorage.removeItem("token");
          window.location.replace("/");
          return;
        }
      }

      if (token) {
        if (isLikelyJwt(token)) {
          finishSuccess(token);
        } else {
          localStorage.removeItem("token");
          window.location.replace("/");
        }
        return;
      }

      try {
        const exchanged = await exchangeGoogleCookie("success");
        if (cancelled) return;
        if (exchanged.token && isLikelyJwt(exchanged.token)) {
          finishSuccess(exchanged.token);
          return;
        }
      } catch {
        // No cookie exchange available (direct navigation) — fallback to home.
      }

      navigate("/", {
        replace: true
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, code, navigate]);
  return <PageLoader />;
});
GoogleAuthSuccessWrapper.displayName = "GoogleAuthSuccessWrapper";
const GoogleAuthErrorPage: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
          {t("googleAuthError")}
        </div>
        <Button onClick={() => navigate("/")} className="w-full mt-4">
          {t("backToHome")}
        </Button>
      </div>
    </div>;
});
GoogleAuthErrorPage.displayName = "GoogleAuthErrorPage";