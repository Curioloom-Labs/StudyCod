import React, { useEffect, useState, Suspense, useCallback, useMemo, startTransition } from "react";
import { Routes, Route, useLocation, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { getMe } from "./lib/api/profile";
import type { User } from "./types";
import { Code2, User as UserIcon, FileText, Home, Menu, X, GraduationCap, BookOpen, Shield, HelpCircle, Library } from "lucide-react";
import { Button } from "./components/ui/Button";
import { Logo } from "./components/Logo";
import { useTranslation } from "react-i18next";
import { AnimatedPage } from "./components/layout/AnimatedPage";
import { staggerContainer, fadeUpItem } from "./lib/motion";
import { TerminalLoader } from "./components/ui/TerminalLoader";
import { DocsPage } from "./pages/DocsPage";
import { OnboardingEntry } from "./components/onboarding/OnboardingEntry";
import { PlacementEntry } from "./components/placement/PlacementEntry";
import { applyTheme, getCurrentTheme, type AppTheme } from "./theme";
import MaintenancePage, { type MaintenancePayload } from "./pages/MaintenancePage";
import { getMaintenanceStatus } from "./lib/api/maintenance";
import { getAdminMaintenance } from "./lib/api/admin";
import { TheoryModalProvider } from "./components/theory/TheoryModalProvider";
import { PublicLandingPage } from "./pages/PublicLandingPage";
const AuthPage = React.lazy(() => import("./pages/AuthPage").then(mod => ({
  default: mod.AuthPage
})));
const VerifyEmailPage = React.lazy(() => import("./pages/VerifyEmailPage").then(mod => ({
  default: mod.VerifyEmailPage
})));
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage").then(mod => ({
  default: mod.ResetPasswordPage
})));
const TasksPage = React.lazy(() => import("./pages/TasksPage").then(mod => ({
  default: mod.TasksPage
})));
const GradesPage = React.lazy(() => import("./pages/GradesPage").then(mod => ({
  default: mod.GradesPage
})));
const ProfilePage = React.lazy(() => import("./pages/ProfilePage").then(mod => ({
  default: mod.ProfilePage
})));
const HomePage = React.lazy(() => import("./pages/HomePage").then(mod => ({
  default: mod.HomePage
})));
const TeacherDashboardPage = React.lazy(() => import("./pages/TeacherDashboardPage").then(mod => ({
  default: mod.TeacherDashboardPage
})));
const ClassDetailsPage = React.lazy(() => import("./pages/ClassDetailsPage").then(mod => ({
  default: mod.ClassDetailsPage
})));
const CreateLessonPage = React.lazy(() => import("./pages/CreateLessonPage").then(mod => ({
  default: mod.CreateLessonPage
})));
const CreateTopicPage = React.lazy(() => import("./pages/CreateTopicPage").then(mod => ({
  default: mod.CreateTopicPage
})));
const TopicDetailsPage = React.lazy(() => import("./pages/TopicDetailsPage").then(mod => ({
  default: mod.TopicDetailsPage
})));
const ControlWorkDetailsPage = React.lazy(() => import("./pages/ControlWorkDetailsPage").then(mod => ({
  default: mod.ControlWorkDetailsPage
})));
const StudentDashboardPage = React.lazy(() => import("./pages/StudentDashboardPage").then(mod => ({
  default: mod.StudentDashboardPage
})));
const StudentLessonsPage = React.lazy(() => import("./pages/StudentLessonsPage").then(mod => ({
  default: mod.StudentLessonsPage
})));
const LessonDetailsPage = React.lazy(() => import("./pages/LessonDetailsPage").then(mod => ({
  default: mod.LessonDetailsPage
})));
const StudentTaskPage = React.lazy(() => import("./pages/StudentTaskPage").then(mod => ({
  default: mod.StudentTaskPage
})));
const GradeDetailsPage = React.lazy(() => import("./pages/GradeDetailsPage").then(mod => ({
  default: mod.GradeDetailsPage
})));
const SummaryGradesPage = React.lazy(() => import("./pages/SummaryGradesPage").then(mod => ({
  default: mod.SummaryGradesPage
})));
const ClassGradebookPage = React.lazy(() => import("./pages/ClassGradebookPage").then(mod => ({
  default: mod.ClassGradebookPage
})));
const GoogleAuthCompletePage = React.lazy(() => import("./pages/GoogleAuthCompletePage").then(mod => ({
  default: mod.GoogleAuthCompletePage
})));
const AdminDashboardPage = React.lazy(() => import("./pages/AdminDashboardPage").then(mod => ({
  default: mod.AdminDashboardPage
})));
const SupportPage = React.lazy(() => import("./pages/SupportPage").then(mod => ({
  default: mod.SupportPage
})));
const TaskLibraryPage = React.lazy(() => import("./pages/TaskLibraryPage").then(mod => ({
  default: mod.TaskLibraryPage
})));
const LibraryTaskSolvePage = React.lazy(() => import("./pages/LibraryTaskSolvePage").then(mod => ({
  default: mod.LibraryTaskSolvePage
})));
const DevEditorPage = React.lazy(() => import("./pages/DevEditorPage").then(mod => ({
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
const AppContent: React.FC = React.memo(() => {
  const {
    t,
    i18n
  } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenancePayload | null>(() => {
    try {
      const raw = sessionStorage.getItem("studycod.maintenance");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
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
    const handler = (e: any) => {
      const d = e?.detail as any;
      if (d && d.maintenance === true) {
        setMaintenance({
          title: String(d.title ?? "Технічне обслуговування"),
          message: String(d.message ?? ""),
          until: d.until ? String(d.until) : null
        });
        setMaintenanceChecked(true);
      }
    };
    window.addEventListener("studycod:maintenance", handler as any);
    return () => window.removeEventListener("studycod:maintenance", handler as any);
  }, []);
  useEffect(() => {
    getMaintenanceStatus().then(s => {
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
    }).catch(() => {}).finally(() => {
      setMaintenanceChecked(true);
    });
  }, []);
  useEffect(() => {
    const handler = (e: any) => {
      const enabled = !!e?.detail?.enabled;
      setAdminMaintenanceEnabled(enabled);
    };
    window.addEventListener("studycod:adminMaintenance", handler as any);
    return () => window.removeEventListener("studycod:adminMaintenance", handler as any);
  }, []);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe().then(u => {
      setUser(u);
      const fromAuth = sessionStorage.getItem("fromAuth");
      if (fromAuth && u.role === "SYSTEM_ADMIN") {
        startTransition(() => {
          setPage("admin");
        });
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && (!u.userMode || u.userMode === "PERSONAL")) {
        startTransition(() => {
          setPage("tasks");
        });
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && u.userMode === "EDUCATIONAL" && u.studentId) {
        startTransition(() => {
          setPage("student");
        });
        sessionStorage.removeItem("fromAuth");
      } else if (fromAuth && u.userMode === "EDUCATIONAL" && !u.studentId) {
        startTransition(() => {
          setPage("teacher");
        });
        sessionStorage.removeItem("fromAuth");
      }
    }).catch(error => {
      const isMaintenance = (error as any)?.response?.status === 503 && (error as any)?.response?.data?.maintenance;
      if (isMaintenance) {
        const d = (error as any).response.data;
        setMaintenance({
          title: String(d.title ?? "Технічне обслуговування"),
          message: String(d.message ?? ""),
          until: d.until ? String(d.until) : null
        });
        return;
      }
      if (import.meta.env.DEV) {
        console.error("Failed to get user:", error);
      }
      localStorage.removeItem("token");
      setUser(null);
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
  const handleToggleNav = useCallback(() => {
    setNavOpen(prev => !prev);
  }, []);
  const handleCloseNav = useCallback(() => {
    setNavOpen(false);
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
    return user.course === "JAVA" ? "Java" : "Python";
  }, [user?.course]);
  const userModeLabel = useMemo(() => {
    if (!user) return "Personal";
    return user.userMode === "EDUCATIONAL" ? "EDU" : "Personal";
  }, [user?.userMode]);
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
        <AuthPage initialMode={authIntent === "register" ? "register" : "login"} showBackToLanding={location.pathname === "/"} onAuth={(u: any) => {
        setUser(u);
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
              MAINTENANCE MODE ENABLED
            </div>}
          {}
          {(!user.userMode || user.userMode === "PERSONAL") && <>
              <button onClick={() => handleSetPage("home")} className={`px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${page === "home" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
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
            Support
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
            window.location.href = "/edu/lessons";
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
            <div className="relative">
              <button onClick={handleToggleNav} className="w-8 h-8 border border-border flex items-center justify-center hover:bg-bg-hover transition-fast" title={t('menu')}>
                {navOpen ? <X className="w-4 h-4 text-text-secondary" /> : <Menu className="w-4 h-4 text-text-secondary" />}
              </button>
              {navOpen && <>
                  <div className="fixed inset-0 z-30" onClick={handleCloseNav} />
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

      {}
      <main className={`flex-1 min-h-0 flex flex-col ${page === "tasks" && user.userMode !== "EDUCATIONAL" ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
        <Suspense fallback={<PageLoader />}>
          {(() => {
          if (page === "admin" && user.role === "SYSTEM_ADMIN") return <AdminDashboardPage />;
          if (page === "home") return <HomePage user={user} onNavigate={handleSetPage} />;
          if (page === "tasks" && user.userMode !== "EDUCATIONAL") return <TasksPage user={user} />;
          if (page === "grades" && user.userMode !== "EDUCATIONAL") return <GradesPage onNavigate={handleSetPage} />;
          if (page === "teacher" && user.userMode === "EDUCATIONAL" && !user.studentId) return <TeacherDashboardPage />;
          if (page === "student" && user.userMode === "EDUCATIONAL") return <StudentDashboardPage user={user} />;
          if (page === "profile") return <ProfilePage user={user} onUserChange={setUser} />;
          return null;
        })()}
        </Suspense>
      </main>
      {user ? <PlacementEntry user={user} onUserChange={setUser} /> : null}
      <OnboardingEntry />
    </div>;
});
AppContent.displayName = "AppContent";
export const App: React.FC = () => {
  const location = useLocation();
  return <TheoryModalProvider>
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
          <Route path="/edu/*" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <EduRoutes />
                </AnimatedPage>
              </Suspense>} />
          <Route path="*" element={<AppContent />} />
        </Routes>
      </AnimatePresence>
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
const EduRoutes: React.FC = React.memo(() => {
  const {
    t,
    i18n
  } = useTranslation();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe().then(u => {
      if (u.userMode !== "EDUCATIONAL") {
        window.location.href = "/";
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
  }, []);
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
    return user.course === "JAVA" ? "Java" : "Python";
  }, [user?.course]);
  if (loading) {
    return <PageLoader />;
  }
  if (!user) {
    return <Suspense fallback={<PageLoader />}>
        <AuthPage onAuth={handleAuth} />
      </Suspense>;
  }
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
          <button onClick={() => window.location.href = "/docs"} className="px-4 py-2 border border-border text-sm font-mono hover:bg-bg-hover transition-fast flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            {t("help")}
          </button>
          <button onClick={() => window.location.href = "/"} className="px-4 py-2 border border-border text-sm font-mono hover:bg-bg-hover transition-fast">
            {t('toHome')}
          </button>
        </div>
      </header>
      <main className={`flex-1 min-h-0 flex flex-col ${/^\/tasks\//.test(location.pathname) ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
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
      </main>
      <OnboardingEntry />
    </div>;
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
  const isLikelyJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
  useEffect(() => {
    if (token) {
      if (isLikelyJwt(token)) {
        localStorage.setItem("token", token);
        sessionStorage.setItem("fromAuth", "true");
        window.location.replace("/");
      } else {
        localStorage.removeItem("token");
        window.location.replace("/");
      }
    } else {
      navigate("/", {
        replace: true
      });
    }
  }, [token, navigate]);
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