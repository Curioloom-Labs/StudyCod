import React, { useEffect, useState, Suspense, useCallback, useMemo, useRef, startTransition } from "react";
import { Routes, Route, useLocation, useNavigate, useSearchParams, useParams, Navigate } from "react-router-dom";
import { enforceSubdomain, getHostContext } from "./lib/subdomain";
import { AnimatePresence } from "framer-motion";
import { getMe } from "./lib/api/profile";
import type { User } from "./types";
import { User as UserIcon, FileText, Home, Menu, X, GraduationCap, BookOpen, Shield, HelpCircle, Library, SunMoon, Search, SwatchBook, LogOut } from "lucide-react";
import { Button } from "./components/ui/Button";
import { Logo } from "./components/Logo";
import { useTranslation } from "react-i18next";
import { AnimatedPage } from "./components/layout/AnimatedPage";
import { PlatformFooter } from "./components/layout/PlatformFooter";
import { PremiumWorkspaceShell } from "./components/layout/PremiumWorkspaceShell";
import { PersonalLearningProvider } from "./components/learning/PersonalLearningProvider";
import { PersonalRouteShell } from "./components/layout/PersonalRouteShell";
import { getLearningMe } from "./lib/api/learningCatalog";
import { PremiumModuleShell } from "./components/layout/PremiumModuleShell";
import { StandaloneShell } from "./components/layout/StandaloneShell";
import { BrandedPageLoader } from "./components/ui/BrandedPageLoader";
import type { MaintenancePayload } from "./pages/system/MaintenancePage";
import { UIModeProvider, useUIMode } from "./components/interface/UIModeProvider";
import { SwitchToMomentumNudge } from "./components/interface/SwitchToMomentumNudge";
import { WorkspaceViewportProvider } from "./components/interface/WorkspaceViewport";
import { MomentumShell, type MomentumNavTarget } from "./layout/momentum/MomentumShell";
import { NovaShellLazy } from "./layout/nova/NovaShellLazy";
import { AuroraShellLazy } from "./layout/aurora/AuroraShellLazy";
import { nextUIMode } from "./lib/uiMode";
import { CommandPalette, type PaletteItem, type PaletteAction } from "./components/interface/CommandPalette";
import { prefetchNavTarget, prefetchPath } from "./lib/prefetchRoutes";
import { isResumableSession, loadResumeState, resolveResumeRoute } from "./lib/resumeState";
import { applyTheme, getCurrentTheme, type AppTheme } from "./theme";
import { getMaintenanceStatus } from "./lib/api/maintenance";
import { getGeoStatus } from "./lib/api/geo";
import { getStoredLanguagePreference, isUkraineCountry, setDetectedCountry } from "./lib/localization";
import type { GeoBlockedPayload } from "./pages/system/GeoBlockedPage";
import { getAdminMaintenance } from "./lib/api/admin";
import { exchangeGoogleCode, exchangeGoogleCookie } from "./lib/api/auth";
import { getControlWorkStatus } from "./lib/api/edu";
import { api } from "./lib/api/client";
import { TheoryModalProvider } from "./components/theory/TheoryModalProvider";
import { NotificationsBell } from "./components/blog/NotificationsBell";
import { ToastViewport } from "./components/ui/ToastViewport";
import { getErrorMessageFromUnknown } from "./lib/safeError";
import { clearControlExamSession, getControlExamSession, isPathAllowedInControlExam, subscribeControlExamSession } from "./lib/controlExamSession";
import { setActiveEduStudentId } from "./lib/eduContext";
import { applySeo } from "./lib/seo";
import { MascotCompanion } from "./components/MascotCompanion";
const AuthPage = React.lazy(() => import("./pages/auth/AuthPage").then(mod => ({ default: mod.AuthPage })));
const VerifyEmailPage = React.lazy(() => import("./pages/auth/VerifyEmailPage").then(mod => ({ default: mod.VerifyEmailPage })));
const ResetPasswordPage = React.lazy(() => import("./pages/auth/ResetPasswordPage").then(mod => ({ default: mod.ResetPasswordPage })));
const TasksPage = React.lazy(() => import("./pages/core/TasksPage").then(mod => ({ default: mod.TasksPage })));
const GradesPage = React.lazy(() => import("./pages/core/GradesPage").then(mod => ({ default: mod.GradesPage })));
const ProfilePage = React.lazy(() => import("./pages/profile/ProfilePage").then(mod => ({ default: mod.ProfilePage })));
const HomePage = React.lazy(() => import("./pages/core/HomePage").then(mod => ({ default: mod.HomePage })));
const LearningPlanPage = React.lazy(() => import("./pages/core/LearningPlanPage").then(mod => ({ default: mod.LearningPlanPage })));
const PublicProfilePage = React.lazy(() => import("./pages/public/PublicProfilePage").then(mod => ({ default: mod.PublicProfilePage })));
const IadPage = React.lazy(() => import("./pages/core/IadPage").then(mod => ({ default: mod.IadPage })));
const LearningCatalogPage = React.lazy(() => import("./pages/learning/LearningCatalogPage").then(mod => ({ default: mod.LearningCatalogPage })));
const LearningCoursePage = React.lazy(() => import("./pages/learning/LearningCoursePage").then(mod => ({ default: mod.LearningCoursePage })));
const CoursePracticePage = React.lazy(() => import("./pages/learning/CoursePracticePage").then(mod => ({ default: mod.CoursePracticePage })));
const CourseProgressPage = React.lazy(() => import("./pages/learning/CourseProgressPage").then(mod => ({ default: mod.CourseProgressPage })));
const PersonalCourseDashboard = React.lazy(() => import("./pages/learning/PersonalCourseDashboard").then(mod => ({ default: mod.PersonalCourseDashboard })));
const LabPracticePage = React.lazy(() => import("./pages/core/LabPracticePage").then(mod => ({ default: mod.LabPracticePage })));
const LegacyAppPageRedirect: React.FC<{ page: string }> = ({ page }) => {
  const location = useLocation();
  if (page === "tasks") {
    const params = new URLSearchParams(location.search);
    const courseId = Number(params.get("courseId"));
    const itemId = Number(params.get("courseItemId"));
    if (Number.isInteger(courseId) && courseId > 0 && Number.isInteger(itemId) && itemId > 0) return <Navigate to={`/learning/course/${courseId}/practice/${itemId}`} replace />;
    return <Navigate to="/lab/library" replace />;
  }
  if (page === "grades") return <LegacyGradesRedirect />;
  const params = new URLSearchParams(location.search);
  params.set("app", page);
  return <Navigate to={`/?${params.toString()}`} replace />;
};
const LegacyCourseRouteRedirect: React.FC = () => {
  const { courseId } = useParams();
  return <Navigate to={`/learning/course/${courseId}/overview`} replace />;
};
const LegacyGradesRedirect: React.FC = () => {
  const [target, setTarget] = React.useState<string | null>(null);
  React.useEffect(() => { void getLearningMe().then((me) => setTarget(me.current ? `/learning/course/${me.current.courseId}/progress` : "/learning/catalog")).catch(() => setTarget("/learning/catalog")); }, []);
  return target ? <Navigate to={target} replace /> : <PageLoader />;
};
const EmailPreferencesResultPage = React.lazy(() => import("./pages/auth/EmailPreferencesResultPage").then(mod => ({ default: mod.EmailPreferencesResultPage })));
const TeacherDashboardPage = React.lazy(() => import("./pages/edu/TeacherWorkspacePage").then(mod => ({ default: mod.TeacherWorkspacePage })));
const ClassDetailsPage = React.lazy(() => import("./pages/edu/ClassHubPage").then(mod => ({ default: mod.ClassHubPage })));
const CreateLessonPage = React.lazy(() => import("./pages/edu/TeacherComposerPages").then(mod => ({ default: mod.CreateLessonWorkspace })));
const CreateTopicPage = React.lazy(() => import("./pages/edu/TeacherComposerPages").then(mod => ({ default: mod.CreateTopicWorkspace })));
const TopicDetailsPage = React.lazy(() => import("./pages/edu/TopicStudioPage").then(mod => ({ default: mod.TopicStudioPage })));
const ControlWorkDetailsPage = React.lazy(() => import("./pages/edu/ControlStudioPage").then(mod => ({ default: mod.ControlStudioPage })));
const StudentDashboardPage = React.lazy(() => import("./pages/edu/StudentJournalPage").then(mod => ({ default: mod.StudentJournalPage })));
const StudentLessonsPage = React.lazy(() => import("./pages/edu/StudentPathPages").then(mod => ({ default: mod.StudentLessonsWorkspace })));
const LessonDetailsPage = React.lazy(() => import("./pages/edu/LessonStudioPage").then(mod => ({ default: mod.LessonStudioPage })));
const StudentTaskPage = React.lazy(() => import("./pages/edu/PracticeCanvasPage").then(mod => ({ default: mod.PracticeCanvasPage })));
const StudentAppealsPage = React.lazy(() => import("./pages/edu/EducationOperationsPages").then(mod => ({ default: mod.StudentAppealsWorkspace })));
const TeacherClassAppealsPage = React.lazy(() => import("./pages/edu/EducationOperationsPages").then(mod => ({ default: mod.TeacherAppealsWorkspace })));
const SummaryGradesPage = React.lazy(() => import("./pages/edu/TeacherDataPages").then(mod => ({ default: mod.SummaryGradesWorkspace })));
const ClassGradebookPage = React.lazy(() => import("./pages/edu/TeacherDataPages").then(mod => ({ default: mod.GradebookWorkspace })));
const JoinClassPage = React.lazy(() => import("./pages/edu/StudentPathPages").then(mod => ({ default: mod.JoinClassWorkspace })));
const CoursesPage = React.lazy(() => import("./pages/edu/CourseStudioPages").then(mod => ({ default: mod.CourseStudioPage })));
const CalendarPage = React.lazy(() => import("./pages/edu/AgendaWorkspacePage").then(mod => ({ default: mod.AgendaWorkspacePage })));
const AttendancePage = React.lazy(() => import("./pages/edu/EducationOperationsPages").then(mod => ({ default: mod.AttendanceWorkspace })));
const TutorPage = React.lazy(() => import("./pages/edu/StudyCompanionPage").then(mod => ({ default: mod.StudyCompanionPage })));
const CourseDetailPage = React.lazy(() => import("./pages/edu/CourseStudioPages").then(mod => ({ default: mod.CourseStudioDetailPage })));
const LessonQuizPage = React.lazy(() => import("./pages/edu/QuizCanvasPage").then(mod => ({ default: mod.QuizCanvasPage })));
const TeacherQuizReviewPage = React.lazy(() => import("./pages/edu/TeacherQuizReviewPage").then(mod => ({ default: mod.TeacherQuizReviewPage })));
const ManualTaskPage = React.lazy(() => import("./pages/edu/ManualReviewPages").then(mod => ({ default: mod.ManualSubmissionCanvas })));
const ManualTaskSubmissionsPage = React.lazy(() => import("./pages/edu/ManualTeacherReviewPage").then(mod => ({ default: mod.ManualTeacherReviewPage })));
const OrgMembersPage = React.lazy(() => import("./pages/edu/OrgWorkspacePage").then(mod => ({ default: mod.OrgWorkspacePage })));
const LiveClassroomPage = React.lazy(() => import("./pages/edu/LiveClassroomPage").then(mod => ({ default: mod.LiveClassroomPage })));
const GoogleAuthCompletePage = React.lazy(() => import("./pages/auth/GoogleAuthCompletePage").then(mod => ({ default: mod.GoogleAuthCompletePage })));
const AdminWorkspacePage = React.lazy(() => import("./pages/system/AdminWorkspacePage").then(mod => ({ default: mod.AdminWorkspacePage })));
const DocsPage = React.lazy(() => import("./pages/system/DocsPage").then(mod => ({ default: mod.DocsPage })));
const SupportPage = React.lazy(() => import("./pages/system/SupportPage").then(mod => ({ default: mod.SupportPage })));
const SupportDeskPage = React.lazy(() => import("./pages/system/SupportDeskPage").then(mod => ({ default: mod.SupportDeskPage })));
const PrivacyPolicyPage = React.lazy(() => import("./pages/system/PrivacyPolicyPage").then(mod => ({ default: mod.PrivacyPolicyPage })));
const TermsOfUsePage = React.lazy(() => import("./pages/system/TermsOfUsePage").then(mod => ({ default: mod.TermsOfUsePage })));
const CookiePolicyPage = React.lazy(() => import("./pages/system/CookiePolicyPage").then(mod => ({ default: mod.CookiePolicyPage })));
const RefundPolicyPage = React.lazy(() => import("./pages/system/RefundPolicyPage").then(mod => ({ default: mod.RefundPolicyPage })));
const PricingPage = React.lazy(() => import("./pages/system/PricingPage").then(mod => ({ default: mod.PricingPage })));
const MaintenancePage = React.lazy(() => import("./pages/system/MaintenancePage").then(mod => ({ default: mod.MaintenancePage })));
const GeoBlockedPage = React.lazy(() => import("./pages/system/GeoBlockedPage").then(mod => ({ default: mod.GeoBlockedPage })));
const ProfileCertificatesPage = React.lazy(() => import("./pages/profile/ProfileCertificatesPage").then(mod => ({ default: mod.ProfileCertificatesPage })));
const CertificateVerifyPage = React.lazy(() => import("./pages/public/CertificateVerifyPage").then(mod => ({ default: mod.CertificateVerifyPage })));
const PublicLandingPage = React.lazy(() => import("./pages/public/PublicLandingPage").then(mod => ({ default: mod.PublicLandingPage })));
const TaskLibraryPage = React.lazy(() => import("./pages/library/TaskLibraryPage").then(mod => ({ default: mod.TaskLibraryPage })));
const LibraryTaskSolvePage = React.lazy(() => import("./pages/library/LibraryTaskSolvePage").then(mod => ({ default: mod.LibraryTaskSolvePage })));
const ContestsPage = React.lazy(() => import("./pages/contest/ContestExperience").then(mod => ({ default: mod.ContestLobbyPage })));
const ContestPage = React.lazy(() => import("./pages/contest/ContestExperience").then(mod => ({ default: mod.ContestDetailPage })));
const ContestProblemSolvePage = React.lazy(() => import("./pages/contest/ContestExperience").then(mod => ({ default: mod.ContestProblemPage })));
const DevEditorPage = React.lazy(() => import("./pages/system/DevEditorPage").then(mod => ({ default: mod.DevEditorPage })));
const CollabDemoPage = React.lazy(() => import("./pages/system/CollabDemoPage").then(mod => ({ default: mod.CollabDemoPage })));
const OnboardingEntry = React.lazy(() => import("./components/onboarding/OnboardingEntry").then(mod => ({ default: mod.OnboardingEntry })));
const PlacementEntry = React.lazy(() => import("./components/placement/PlacementEntry").then(mod => ({ default: mod.PlacementEntry })));
const PlaygroundPage = React.lazy(() => import("./pages/system/PlaygroundPage").then(mod => ({ default: mod.PlaygroundPage })));
const ParentDashboardPage = React.lazy(() => import("./pages/edu/EducationOperationsPages").then(mod => ({ default: mod.ParentWorkspace })));
const AcceptInvitePage = React.lazy(() => import("./pages/edu/AcceptInvitePage").then(mod => ({ default: mod.AcceptInvitePage })));
const SolveReplayPage = React.lazy(() => import("./pages/core/SolveReplayPage").then(mod => ({ default: mod.SolveReplayPage })));
const BlogPage = React.lazy(() => import("./pages/system/BlogPage").then(mod => ({ default: mod.BlogPage })));
const BlogPostPage = React.lazy(() => import("./pages/system/BlogPage").then(mod => ({ default: mod.BlogPostPage })));
const BlogAdminPage = React.lazy(() => import("./pages/system/BlogAdminPage").then(mod => ({ default: mod.BlogAdminPage })));
const PageLoader: React.FC = () => {
  return <BrandedPageLoader />;
};
const PublicPageWithFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="mobile-app-shell flex min-h-[100dvh] flex-col"><div className="mobile-app-viewport flex-1 pb-[env(safe-area-inset-bottom)]">{children}</div><PlatformFooter /></div>;
type Page = "home" | "tasks" | "grades" | "plan" | "profile" | "teacher" | "student" | "admin";

// A deliberately local-only product preview. It lets design review happen
// without manufacturing a token or touching real user data.
const DEV_PREVIEW_USER: User = {
  id: -101,
  username: "Oksana",
  firstName: "Оксана",
  lastName: "Мельник",
  activeRuntime: "PYTHON",
  difus: 72,
  avatarUrl: null,
  userMode: "PERSONAL",
  role: "USER",
  placementDone: true,
  placementLevel: "INTERMEDIATE",
};

function isPageAvailableForUser(page: Page, user: User): boolean {
  if (page === "admin") return user.role === "SYSTEM_ADMIN";
  if (page === "teacher") return user.userMode === "EDUCATIONAL" && !user.studentId;
  if (page === "student") return user.userMode === "EDUCATIONAL" && !!user.studentId;
  if (page === "tasks" || page === "grades") return user.userMode !== "EDUCATIONAL";
  return true;
}

function resolvePageForUser(page: Page, user: User): Page {
  return isPageAvailableForUser(page, user) ? page : "home";
}

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

const getHttpStatusFromError = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const status = Reflect.get(response, "status");
  return typeof status === "number" ? status : null;
};

const getRetryAfterSecondsFromError = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;

  const headers = Reflect.get(response, "headers");
  const headerValue = headers && typeof headers === "object"
    ? Reflect.get(headers, "retry-after")
    : null;
  const retryAfterFromHeader = Number(headerValue);
  if (Number.isFinite(retryAfterFromHeader) && retryAfterFromHeader > 0) {
    return Math.ceil(retryAfterFromHeader);
  }

  const data = Reflect.get(response, "data");
  if (!data || typeof data !== "object") return null;

  const retryAfterSeconds = Number(Reflect.get(data, "retryAfterSeconds"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds);
  }

  const details = Reflect.get(data, "details");
  if (details && typeof details === "object") {
    const retryAfterMs = Number(Reflect.get(details, "retryAfterMs"));
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return Math.ceil(retryAfterMs / 1000);
    }
  }

  return null;
};

const isAuthErrorStatus = (status: number | null): boolean => {
  return status === 401 || status === 403;
};

const delay = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, Math.max(0, ms));
});

const getCurrentUserWithRetry = async (maxAttempts = 3): Promise<User> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Boot-time session probing must never trigger the global 401 redirect.
      // The app needs to render the auth screen when this request is expected
      // to fail (for example on /?auth=login).
      return await getMe({ suppressAuthRedirect: true });
    } catch (error: unknown) {
      lastError = error;

      const maintenance = extractMaintenanceData(error);
      if (maintenance.status === 503 && maintenance.data?.maintenance === true) {
        throw error;
      }

      const status = getHttpStatusFromError(error);
      const shouldRetry = status === null || status === 429 || status >= 500;
      const isLastAttempt = attempt >= maxAttempts - 1;
      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      const retryAfterSeconds = getRetryAfterSecondsFromError(error);
      const backoffMs = Math.min(4000, 800 * (attempt + 1));
      const retryAfterMs = retryAfterSeconds && retryAfterSeconds > 0
        ? Math.min(8000, Math.max(1000, retryAfterSeconds * 1000))
        : backoffMs;
      await delay(retryAfterMs);
    }
  }

  throw lastError ?? new Error("GET_ME_FAILED");
};

function asPage(value: string): Page | null {
  return value === "home" || value === "tasks" || value === "grades" || value === "plan" || value === "profile" || value === "teacher" || value === "student" || value === "admin" ? value : null;
}

function toMomentumPageTarget(value: MomentumNavTarget): Page | null {
  return asPage(value);
}

function getRequestedAppPage(searchParams: URLSearchParams): Page | null {
  return asPage(String(searchParams.get("app") ?? ""));
}

function getSafeNextAfterAuth(searchParams: URLSearchParams): string | null {
  const raw = String(searchParams.get("next") ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  try {
    const target = new URL(raw, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    if (target.pathname === "/") {
      const targetParams = target.searchParams;
      if (targetParams.has("auth") || targetParams.has("next")) return null;
    }
  } catch {
    return null;
  }
  return raw;
}

const AppContent: React.FC = React.memo(() => {
  const {
    t,
    i18n
  } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const ui = useUIMode();
  const navigate = useNavigate();
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
  const [geoBlock, setGeoBlock] = useState<GeoBlockedPayload | null>(() => {
    try {
      const raw = sessionStorage.getItem("studycod.geoblock");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { geoBlocked?: unknown; country?: unknown };
      if (parsed && parsed.geoBlocked === true) {
        return { country: typeof parsed.country === "string" ? parsed.country : null };
      }
      return null;
    } catch {
      return null;
    }
  });
  const [adminMaintenanceEnabled, setAdminMaintenanceEnabled] = useState<boolean>(false);
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [bootResumeHandled, setBootResumeHandled] = useState<boolean>(false);
  const requestedAppPage = useMemo(() => getRequestedAppPage(searchParams), [searchParams]);
  const isDevPreview = import.meta.env.DEV && searchParams.get("preview") === "true";
  const previewPersona = searchParams.get("persona");
  const resolvedPage = useMemo(() => {
    if (!user) return page;
    return resolvePageForUser(page, user);
  }, [page, user?.id, user?.role, user?.userMode, user?.studentId]);
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
    if (!user) return;
    try {
      const requested = sessionStorage.getItem("studycod.openPage");
      if (!requested) return;
      const next = asPage(requested);
      if (next && isPageAvailableForUser(next, user)) {
        startTransition(() => setPage(next));
      }
      sessionStorage.removeItem("studycod.openPage");
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (location.pathname !== "/") return;
    if (user.userMode !== "EDUCATIONAL" && requestedAppPage === "tasks") {
      const courseId = Number(searchParams.get("courseId"));
      const itemId = Number(searchParams.get("courseItemId"));
      if (Number.isInteger(courseId) && courseId > 0 && Number.isInteger(itemId) && itemId > 0) {
        navigate(`/learning/course/${courseId}/practice/${itemId}`, { replace: true });
      } else {
        navigate("/lab/library", { replace: true });
      }
      return;
    }
    if (user.userMode !== "EDUCATIONAL" && requestedAppPage === "grades") {
      void getLearningMe().then((me) => navigate(me.current ? `/learning/course/${me.current.courseId}/progress` : "/learning/catalog", { replace: true })).catch(() => navigate("/learning/catalog", { replace: true }));
      return;
    }
    if (!requestedAppPage) return;
    if (!isPageAvailableForUser(requestedAppPage, user)) return;
    if (requestedAppPage === page) return;
    startTransition(() => setPage(requestedAppPage));
  }, [user?.id, location.pathname, requestedAppPage]);

  useEffect(() => {
    if (!user) return;
    if (location.pathname !== "/") return;

    const currentRequested = getRequestedAppPage(searchParams);
    // A top-level navigation can intentionally remove `app` while React is
    // still committing the destination page. Do not re-add the stale page
    // from the previous render during that transition.
    if (!requestedAppPage && resolvedPage !== "home") return;
    const target = resolvedPage === "home" ? null : resolvedPage;
    if (currentRequested === target) return;

    const nextSearch = new URLSearchParams(searchParams);
    if (target) {
      nextSearch.set("app", target);
    } else {
      nextSearch.delete("app");
    }

    const next = nextSearch.toString();
    navigate({
      pathname: "/",
      search: next ? `?${next}` : ""
    }, {
      replace: true
    });
  }, [user?.id, location.pathname, requestedAppPage, resolvedPage, navigate, searchParams]);
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const d = (e.detail ?? null) as { geoBlocked?: boolean; country?: string | null } | null;
      if (d && d.geoBlocked === true) {
        setGeoBlock({ country: typeof d.country === "string" ? d.country : null });
      }
    };
    window.addEventListener("studycod:geoblock", handler as EventListener);
    return () => window.removeEventListener("studycod:geoblock", handler as EventListener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    getGeoStatus()
      .then(s => {
        if (cancelled) return;
        const country = setDetectedCountry(s.country);
        if (!getStoredLanguagePreference() && isUkraineCountry(country) && !i18n.language?.toLowerCase().startsWith("uk")) {
          void i18n.changeLanguage("uk");
        }
        if (s.geoBlocked) {
          setGeoBlock({ country: s.country });
        } else {
          setGeoBlock(null);
          try {
            sessionStorage.removeItem("studycod.geoblock");
          } catch {}
        }
      })
      .catch(() => {
        // Network/lookup failure must not lock anyone out — rely on the 451
        // interceptor if a real blocked response arrives later.
      });
    return () => {
      cancelled = true;
    };
  }, []);
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
    let cancelled = false;
    if (isDevPreview) {
      setUser(previewPersona === "admin" ? { ...DEV_PREVIEW_USER, role: "SYSTEM_ADMIN", username: "admin-preview", firstName: "Admin" } : DEV_PREVIEW_USER);
      setBootResumeHandled(true);
      setLoading(false);
      return;
    }
    const run = async () => {
      try {
        const u = await getCurrentUserWithRetry(6);
        if (cancelled) return;

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
      } catch (error: unknown) {
        if (cancelled) return;

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
          setBootResumeHandled(true);
          return;
        }

        const status = getHttpStatusFromError(error);
        if (import.meta.env.DEV) {
          console.error("Failed to get user:", getErrorMessageFromUnknown(error, "unknown error"));
        }

        if (isAuthErrorStatus(status)) setUser(null);

        setBootResumeHandled(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isDevPreview, previewPersona]);
  useEffect(() => {
    if (!user || user.role !== "SYSTEM_ADMIN") return;
    getAdminMaintenance().then(r => setAdminMaintenanceEnabled(!!r.state?.enabled)).catch(() => setAdminMaintenanceEnabled(false));
  }, [user?.role]);
  const handleLogout = useCallback(() => {
    // Best-effort server logout clears the httpOnly cookie and revokes the
    // current JWT. Local state is cleared immediately so a slow API cannot
    // keep the UI in an authenticated state.
    void api.post("/auth/logout", undefined, {
      headers: { "X-Skip-Auth-Redirect": "1" }
    }).catch(() => undefined);
    clearControlExamSession();
    startTransition(() => {
      setUser(null);
      setPage("home");
    });
    // Leave any product route (/edu, /contest) — otherwise logout just flips
    // `page` state that those routes don't render, leaving the user stuck on a
    // now-unauthed EDU/contest page. Landing on "/" shows the shared login.
    navigate("/");
  }, [navigate]);
  const handleSetPage = useCallback((newPage: Page) => {
    if (user?.userMode !== "EDUCATIONAL") {
      if (newPage === "home") {
        startTransition(() => setPage("home"));
        navigate("/");
        setNavOpen(false);
        return;
      }
      if (newPage === "tasks") { navigate("/lab/practice?workspace=personal"); setNavOpen(false); return; }
      if (newPage === "grades") { navigate("/learning/catalog"); setNavOpen(false); return; }
    }
    startTransition(() => {
      setPage(newPage);
    });
    setNavOpen(false);
  }, [navigate, user?.userMode]);
  const handleGoHome = useCallback(() => {
    startTransition(() => {
      setPage("home");
    });
    if (user?.userMode !== "EDUCATIONAL") navigate("/");
    setNavOpen(false);
  }, [navigate, user?.userMode]);

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
    const runtime = user.activeRuntime || "PYTHON";
    return runtime === "JAVA" ? "Java" : runtime === "PYTHON" ? "Python" : "C++";
  }, [user?.activeRuntime]);
  const userModeLabel = useMemo(() => {
    if (!user) return "Personal";
    if (user.userMode === "EDUCATIONAL") return "EDU";
    if (user.userMode === "CONTEST") return "Contest";
    return "Personal";
  }, [user?.userMode]);

  const setWorkspaceViewportRef = useCallback((el: HTMLElement | null) => {
    setWorkspaceViewportEl(el);
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (ui.mode !== "classic" || !user) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ui.mode, user?.id]);

  const classicPaletteItems = useMemo<PaletteItem[]>(() => {
    if (!user) return [];
    const navLabel = t("navigation", { defaultValue: "Navigation" });
    const list: PaletteItem[] = [{ id: "home", label: t("home"), icon: Home, group: navLabel }];
    if (!user.userMode || user.userMode === "PERSONAL") {
      list.push({ id: "tasks", label: t("tasks"), icon: FileText, group: navLabel });
      list.push({ id: "grades", label: t("grades"), icon: FileText, group: navLabel });
      list.push({ id: "library", label: t("library"), icon: Library, group: navLabel });
    }
    if (user.userMode === "EDUCATIONAL" && user.studentId) {
      list.push({ id: "student", label: t("myJournal"), icon: BookOpen, group: navLabel });
      list.push({ id: "lessons", label: t("lessons"), icon: FileText, group: navLabel });
      list.push({ id: "library", label: t("library"), icon: Library, group: navLabel });
      list.push({ id: "appeals", label: i18n.language?.toLowerCase().startsWith("en") ? "Appeals" : "Апеляції", icon: HelpCircle, group: navLabel });
    }
    if (user.userMode === "EDUCATIONAL" && !user.studentId) {
      list.push({ id: "teacher", label: t("myClasses"), icon: GraduationCap, group: navLabel });
    }
    if (user.role === "SYSTEM_ADMIN") {
      list.push({ id: "admin", label: "Admin", icon: Shield, group: navLabel });
    }
    if (user.role === "SUPPORT" || user.role === "SYSTEM_ADMIN") {
      list.push({ id: "support-desk", label: "Support desk", icon: HelpCircle, group: navLabel });
    }
    list.push({ id: "profile", label: t("profile"), icon: UserIcon, group: t("account") });
    return list;
  }, [user?.id, user?.userMode, user?.studentId, user?.role, t, i18n.language]);

  const classicPaletteActions = useMemo<PaletteAction[]>(() => [
    { id: "help", label: t("help"), icon: HelpCircle, run: () => navigate("/docs") },
    { id: "support", label: t("support"), icon: HelpCircle, run: () => navigate("/support") },
    { id: "theme", label: theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme"), icon: SunMoon, run: toggleTheme },
    { id: "interface", label: `${t("interfaceLabel")}: ${t("classicUiName")}`, icon: SwatchBook, run: () => ui.setMode("focus") },
    { id: "logout", label: t("logout"), icon: LogOut, danger: true, run: handleLogout }
  ], [t, navigate, theme, toggleTheme, ui, handleLogout]);

  const handleClassicPaletteSelect = useCallback((id: string) => {
    if (id === "library") {
      if (user?.userMode === "EDUCATIONAL" && user.studentId) {
        navigate("/edu/library");
      } else {
        navigate("/library");
      }
      return;
    }
    if (id === "support-desk") {
      navigate("/support/desk");
      return;
    }
    if (id === "lessons") {
      navigate("/edu/lessons");
      return;
    }
    if (id === "appeals") {
      navigate("/edu/appeals");
      return;
    }
    const pageTarget = asPage(id);
    if (pageTarget) handleSetPage(pageTarget);
  }, [user?.userMode, user?.studentId, navigate, handleSetPage]);

  if (geoBlock) {
    return <Suspense fallback={<PageLoader />}>
        <GeoBlockedPage state={geoBlock} />
      </Suspense>;
  }
  if (!maintenanceChecked) {
    return <PageLoader />;
  }
  if (loading) {
    return <PageLoader />;
  }

  if (user && !bootResumeHandled) {
    return <PageLoader />;
  }
  if (!user) {
    if (maintenance && !showAdminLogin) {
      return <Suspense fallback={<PageLoader />}>
        <MaintenancePage state={maintenance} onAdminLogin={() => {
        startTransition(() => setShowAdminLogin(true));
      }} onRetry={() => {
        window.location.reload();
      }} />
      </Suspense>;
    }

    const authIntent = searchParams.get("auth");
    const wantsAuth = authIntent === "login" || authIntent === "register";
    const showLanding = location.pathname === "/" && !wantsAuth;
    if (showLanding) {
      return <Suspense fallback={<PageLoader />}>
        <PublicLandingPage />
      </Suspense>;
    }

    const nextAfterAuth = getSafeNextAfterAuth(searchParams);
    return <PublicPageWithFooter><Suspense fallback={<PageLoader />}>
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
      </Suspense></PublicPageWithFooter>;
  }
  if (maintenance && user.role !== "SYSTEM_ADMIN") {
    return <PublicPageWithFooter><Suspense fallback={<PageLoader />}>
      <MaintenancePage state={maintenance} onRetry={() => {
      window.location.reload();
    }} />
    </Suspense></PublicPageWithFooter>;
  }
  // EDU users live entirely under /edu — the main app shell only serves them the
  // shared pages (profile/admin). Anything else bounces to /edu so there is a
  // single EDU router (no duplicate teacher/student rendering here).
  // Personal/Contest users are unaffected.
  if (user.userMode === "EDUCATIONAL"
    && requestedAppPage !== "profile" && requestedAppPage !== "admin"
    && resolvedPage !== "profile" && resolvedPage !== "admin") {
    return <Navigate to="/edu" replace />;
  }
  const content = <Suspense fallback={<PageLoader />}>
      {(() => {
      if (resolvedPage === "admin" && user.role === "SYSTEM_ADMIN") return <AdminWorkspacePage />;
      if (resolvedPage === "home") {
        return <HomePage user={user} onNavigate={handleSetPage} suppressFocusAutoResume={ui.mode !== "classic"} />;
      }
      if (resolvedPage === "tasks" && user.userMode !== "EDUCATIONAL") return <TasksPage user={user} />;
      if (resolvedPage === "grades" && user.userMode !== "EDUCATIONAL") return <GradesPage onNavigate={handleSetPage} />;
      if (resolvedPage === "plan" && user.userMode !== "EDUCATIONAL") return <TasksPage user={user} />;
      // EDU teacher/student dashboards live under /edu only (the redirect guard
      // above bounces EDU users here away from the main shell).
      if (resolvedPage === "profile") return <ProfilePage user={user} onUserChange={setUser} />;
      return null;
    })()}
    </Suspense>;

  // The personal product no longer sits inside any legacy terminal/momentum
  // shell. It owns a single, calm SaaS workspace chrome across every core page.
  if (user.userMode !== "EDUCATIONAL") {
    return <PersonalLearningProvider><PremiumWorkspaceShell
      user={user}
      page={resolvedPage}
      theme={theme}
      onNavigate={handleSetPage}
      onLibrary={() => navigate(import.meta.env.DEV && searchParams.get("preview") === "true" ? "/lab/library?preview=true" : "/lab/library")}
      onCourses={() => navigate(import.meta.env.DEV && searchParams.get("preview") === "true" ? "/learning/catalog?preview=true" : "/learning/catalog")}
      onPlayground={() => navigate(import.meta.env.DEV && searchParams.get("preview") === "true" ? "/lab/playground?preview=true" : "/lab/playground")}
      onToggleTheme={toggleTheme}
      onToggleLanguage={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")}
      onSupport={() => navigate("/support")}
      onSupportDesk={() => navigate("/support/desk")}
      onLogout={handleLogout}
    >
      {content}
    </PremiumWorkspaceShell></PersonalLearningProvider>;
  }

  if (ui.mode === "classic") {
    return <div className="mobile-app-shell min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
        {}
        <header className="studycod-app-header sticky top-0 z-40 min-h-[72px] border-b border-[#152219]/10 bg-[#f7f8f5]/85 text-[#142017] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b120e]/85 dark:text-[#edf3ef] flex flex-col md:flex-row md:items-center justify-between px-4 md:px-6 py-2 gap-2 flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0 flex-wrap md:flex-nowrap">
            <div className="flex items-center gap-2">
              <Logo size={24} className="text-primary" />
              <span className="text-lg font-mono font-semibold tracking-[0.01em] text-text-primary">StudyCod</span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="hidden sm:block px-3 py-1 border border-border bg-bg-surface text-sm font-mono text-text-secondary">
              {courseLabel}
            </div>
            {user.userMode && <>
                <div className="hidden sm:block h-6 w-px bg-border" />
                <div className="hidden sm:block px-3 py-1 border border-border bg-bg-surface text-sm font-mono text-text-secondary">
                  {userModeLabel}
                </div>
              </>}
          </div>

          <div className="w-full md:w-auto flex items-center gap-2 overflow-x-auto whitespace-nowrap justify-start md:justify-end">
            {user.role === "SYSTEM_ADMIN" && adminMaintenanceEnabled && <div className="px-3 py-1 border border-accent-warning/60 bg-accent-warning/12 text-accent-warning text-xs font-mono">
                {t("maintenanceModeEnabled")}
              </div>}
            {}
            {user.userMode !== "EDUCATIONAL" && <>
                <button type="button" onClick={handleGoHome} onPointerEnter={() => prefetchNavTarget("continue")} onFocus={() => prefetchNavTarget("continue")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "home" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <Home className="w-4 h-4" />
                  {t('home')}
                </button>
                <button type="button" onClick={() => handleSetPage("tasks")} onPointerEnter={() => prefetchNavTarget("tasks")} onFocus={() => prefetchNavTarget("tasks")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "tasks" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <FileText className="w-4 h-4" />
                  {t('tasks')}
                </button>
                <button type="button" onClick={() => handleSetPage("grades")} onPointerEnter={() => prefetchNavTarget("grades")} onFocus={() => prefetchNavTarget("grades")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "grades" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <FileText className="w-4 h-4" />
                  {t('grades')}
                </button>
                <button type="button" onClick={() => navigate("/library")} onPointerEnter={() => prefetchNavTarget("library")} onFocus={() => prefetchNavTarget("library")} className="shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary">
                  <Library className="w-4 h-4" />
                  {t("library")}
                </button>
                <button type="button" onClick={() => navigate("/learning/catalog")} className="shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary">
                  <BookOpen className="w-4 h-4" />
                  {i18n.language?.toLowerCase().startsWith("en") ? "Courses" : "Курси"}
                </button>
              </>}

            {}
            {user.role === "SYSTEM_ADMIN" && <button type="button" onClick={() => handleSetPage("admin")} onPointerEnter={() => prefetchNavTarget("admin")} onFocus={() => prefetchNavTarget("admin")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "admin" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                <Shield className="w-4 h-4" />
                Admin
              </button>}

            {(user.role === "SUPPORT" || user.role === "SYSTEM_ADMIN") && <button type="button" onClick={() => navigate("/support/desk")} onPointerEnter={() => prefetchPath("/support/desk")} onFocus={() => prefetchPath("/support/desk")} className="shrink-0 px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                Support desk
              </button>}

            {}
            {user.userMode === "EDUCATIONAL" && !user.studentId && <button type="button" onClick={() => handleSetPage("teacher")} onPointerEnter={() => prefetchNavTarget("teacher")} onFocus={() => prefetchNavTarget("teacher")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "teacher" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                <GraduationCap className="w-4 h-4" />
                {t('myClasses')}
              </button>}

            {user.userMode === "EDUCATIONAL" && user.studentId && <>
                <button type="button" onClick={() => handleSetPage("student")} onPointerEnter={() => prefetchNavTarget("student")} onFocus={() => prefetchNavTarget("student")} className={`shrink-0 px-4 py-2 text-sm font-mono border transition-fast flex items-center gap-2 ${resolvedPage === "student" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}>
                  <BookOpen className="w-4 h-4" />
                  {t('myJournal')}
                </button>
                <button type="button" onClick={() => navigate("/edu/library")} onPointerEnter={() => prefetchPath("/edu/library")} onFocus={() => prefetchPath("/edu/library")} className="shrink-0 px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                  <Library className="w-4 h-4" />
                  {t("library")}
                </button>
                <button type="button" onClick={() => {
              navigate("/edu/appeals");
            }} className="shrink-0 px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  {i18n.language?.toLowerCase().startsWith("en") ? "Appeals" : "Апеляції"}
                </button>
                <button type="button" onClick={() => {
              navigate("/edu/lessons");
            }} onPointerEnter={() => prefetchNavTarget("lessons")} onFocus={() => prefetchNavTarget("lessons")} className="shrink-0 px-4 py-2 text-sm font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t('lessons')}
                </button>
              </>}

            <div className="h-6 w-px bg-border mx-2" />

            {}
            <div className="flex items-center gap-2">
              {}
              <button type="button" onClick={() => setPaletteOpen(true)} className="shrink-0 px-3 py-2 text-xs font-mono border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-2" title={t("searchOrJump", { defaultValue: i18n.language?.toLowerCase().startsWith("uk") ? "Пошук або перехід…" : "Search or jump to…" })} aria-label={t("searchOrJump", { defaultValue: i18n.language?.toLowerCase().startsWith("uk") ? "Пошук або перехід…" : "Search or jump to…" })} aria-haspopup="dialog">
                <Search className="w-4 h-4" />
                <kbd className="hidden md:inline px-1.5 py-0.5 border border-border text-[10px] font-mono text-text-muted">Ctrl K</kbd>
              </button>
              <button type="button" onClick={() => i18n.changeLanguage(i18n.language === 'uk' ? 'en' : 'uk')} className="shrink-0 px-3 py-1 text-xs font-mono font-medium tracking-[0.03em] border border-border hover:bg-bg-hover transition-fast" title={i18n.language === 'uk' ? t('switchToEnglish') : t('switchToUkrainian')} aria-label={i18n.language === 'uk' ? t('switchToEnglish') : t('switchToUkrainian')}>
                {i18n.language === 'uk' ? 'EN' : 'UA'}
              </button>

              {}
              <button type="button" onClick={toggleTheme} className="shrink-0 px-3 py-1 text-xs font-mono font-medium tracking-[0.03em] border border-border hover:bg-bg-hover transition-fast" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")} aria-label={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              
              <button type="button" onClick={() => handleSetPage("profile")} onPointerEnter={() => prefetchNavTarget("profile")} onFocus={() => prefetchNavTarget("profile")} className={`w-11 h-11 border flex items-center justify-center hover:bg-bg-hover transition-fast ${resolvedPage === "profile" ? "border-primary" : "border-border"}`} title={t('profile')} aria-label={t('profile')}>
                <UserIcon className="w-4 h-4 text-text-secondary" />
              </button>
              <div className="relative" ref={navMenuRef}>
                <button type="button" onClick={handleToggleNav} className="w-11 h-11 border border-border flex items-center justify-center hover:bg-bg-hover transition-fast" title={t('menu')} aria-label={t('menu')} aria-haspopup="menu" aria-expanded={navOpen}>
                  {navOpen ? <X className="w-4 h-4 text-text-secondary" /> : <Menu className="w-4 h-4 text-text-secondary" />}
                </button>
                {navOpen && <>
                    <div className="absolute right-0 top-12 z-40 bg-bg-surface border border-border min-w-[200px]" role="menu" aria-label={t('menu')}>
                      <nav className="flex flex-col">
                        <button type="button" role="menuitem" onClick={() => {
                      setNavOpen(false);
                      navigate("/docs");
                    }} className="px-4 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-text-secondary flex items-center gap-2">
                          <HelpCircle className="w-4 h-4" />
                          {t('help')}
                        </button>
                        <button type="button" role="menuitem" onClick={() => {
                      setNavOpen(false);
                      navigate("/support");
                    }} className="px-4 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-text-secondary flex items-center gap-2">
                          <HelpCircle className="w-4 h-4" />
                          {t('support')}
                        </button>
                        <button type="button" role="menuitem" onClick={() => {
                      setNavOpen(false);
                      ui.setMode(nextUIMode(ui.mode));
                    }} className="px-4 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-text-secondary border-t border-border">
                          {t("interfaceLabel")}: {ui.mode === "classic" ? t("classicUiName") : ui.mode === "focus" ? t("momentumUiName") : ui.mode === "aurora" ? t("auroraUiName", { defaultValue: "Aurora" }) : t("novaUiName", { defaultValue: "Nova" })}
                        </button>
                        <button type="button" role="menuitem" onClick={handleLogout} className="px-4 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-fast text-accent-error border-t border-border">
                          {t('logout')}
                        </button>
                      </nav>
                    </div>
                  </>}
              </div>
            </div>
          </div>
        </header>

        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden" aria-label={i18n.language === "uk" ? "Мобільна навігація" : "Mobile navigation"}>
          <div className="grid grid-cols-5 gap-1">
            <button type="button" onClick={() => user.studentId ? navigate("/edu/lessons") : handleSetPage("teacher")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <Home className="h-4 w-4" /><span className="text-[10px] font-semibold">{user.studentId ? t("lessons") : t("myClasses")}</span>
            </button>
            <button type="button" onClick={() => user.studentId ? handleSetPage("student") : navigate("/edu/courses")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <BookOpen className="h-4 w-4" /><span className="text-[10px] font-semibold">{user.studentId ? t("myJournal") : t("eduNavCourses", { defaultValue: "Courses" })}</span>
            </button>
            <button type="button" onClick={() => navigate(user.studentId ? "/edu/library" : "/edu/calendar")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary">
              <Library className="h-4 w-4" /><span className="text-[10px] font-semibold">{user.studentId ? t("library") : t("eduNavCalendar", { defaultValue: "Calendar" })}</span>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary" aria-label={t("searchOrJump", { defaultValue: "Search" })}>
              <Search className="h-4 w-4" /><span className="text-[10px] font-semibold">{t("search", { defaultValue: "Search" })}</span>
            </button>
            <button type="button" onClick={() => handleSetPage("profile")} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl hover:bg-bg-hover hover:text-text-primary ${resolvedPage === "profile" ? "bg-primary/10 text-primary" : "text-text-secondary"}`}>
              <UserIcon className="h-4 w-4" /><span className="text-[10px] font-semibold">{t("profile")}</span>
            </button>
          </div>
        </nav>

        <SwitchToMomentumNudge />

        <WorkspaceViewportProvider element={workspaceViewportEl}>
          <main ref={setWorkspaceViewportRef} className={`mobile-app-viewport flex-1 min-h-0 flex flex-col pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0 ${resolvedPage === "tasks" && user.userMode !== "EDUCATIONAL" ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
            {content}
          </main>
        </WorkspaceViewportProvider>
        <PlatformFooter className="flex-shrink-0" />
        <Suspense fallback={null}>
            <PlacementEntry user={user} onUserChange={setUser} />
          </Suspense>
        <Suspense fallback={null}>
          <OnboardingEntry />
        </Suspense>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={classicPaletteItems} onSelect={handleClassicPaletteSelect} extraActions={classicPaletteActions} />
      </div>;
  }

        const momentumCurrent: MomentumNavTarget = resolvedPage === "home" || resolvedPage === "plan" ? "continue" : resolvedPage;
  const Shell = ui.mode === "nova" ? NovaShellLazy : ui.mode === "aurora" ? AuroraShellLazy : MomentumShell;
  return <>
      <Suspense fallback={<PageLoader />}>
      <Shell user={user} current={momentumCurrent} onNavigate={target => {
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
      if (target === "blog") {
        navigate("/blog");
        return;
      }
      if (target === "contests") {
        navigate("/contests");
        return;
      }
      if (target === "playground") {
        navigate("/playground");
        return;
      }
      if (target === "learn") {
        // Personal learning now lives in the course catalog. Keep the old URL
        // as a compatibility redirect so it cannot reopen the legacy skill-tree
        // workspace.
        navigate("/learning/catalog");
        return;
      }
      if (target === "continue") {
        handleGoHome();
        return;
      }
      if (target === "lessons") {
        navigate("/edu/lessons");
        return;
      }
      if (target === "teacher") {
        navigate("/edu");
        return;
      }
      if (target === "org") {
        navigate("/edu/organization");
        return;
      }
      if (target === "courses") {
        navigate("/edu/courses");
        return;
      }
      if (target === "calendar") {
        navigate("/edu/calendar");
        return;
      }
      if (target === "tutor") {
        navigate("/edu/tutor");
        return;
      }
      if (target === "student") {
        navigate("/edu/journal");
        return;
      }
      const pageTarget = toMomentumPageTarget(target);
      if (pageTarget) {
        handleSetPage(pageTarget);
      }
        }} onLogout={handleLogout} topRight={<div className="flex items-center gap-2"><NotificationsBell /><button type="button" onClick={toggleTheme} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border border-border bg-bg-surface text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")} aria-label={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
          <SunMoon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button></div>}>
        {content}
      </Shell>
      </Suspense>
      <Suspense fallback={null}>
          <PlacementEntry user={user} onUserChange={setUser} />
        </Suspense>
      <Suspense fallback={null}>
        <OnboardingEntry />
      </Suspense>
    </>;
});
AppContent.displayName = "AppContent";
export const App: React.FC = () => {
  const location = useLocation();
  const { i18n } = useTranslation();
  const topLevelRouteKey = useMemo(() => {
    const path = location.pathname || "/";
    if (/^\/edu(?:\/|$)/.test(path)) return "/edu";
    if (/^\/contest(?:\/|$)/.test(path)) return "/contest";
    return path;
  }, [location.pathname]);
  const subdomainNavigate = useNavigate();
  const didSubdomainLand = useRef(false);
  useEffect(() => {
    applySeo(location.pathname, i18n.language?.toLowerCase().startsWith("uk") ? "uk" : "en", location.search);
  }, [i18n.language, location.pathname, location.search]);
  useEffect(() => {
    // Keep EDU on school.* and contests on contest.* (separate entry points).
    enforceSubdomain(location.pathname);
  }, [location.pathname]);
  useEffect(() => {
    // A *fresh* load of a product subdomain's bare root lands in that product.
    // Runs once on mount only — otherwise Home/logout (→ "/") would be yanked
    // straight back here, trapping the user out of the landing/login/Personal
    // area (which lives on the "*" route, i.e. "/").
    if (didSubdomainLand.current) return;
    didSubdomainLand.current = true;
    if (location.pathname !== "/") return;
    const ctx = getHostContext();
    if (ctx === "school") subdomainNavigate("/edu", { replace: true });
    else if (ctx === "contest") subdomainNavigate("/contest", { replace: true });
  }, [location.pathname, subdomainNavigate]);
  return <TheoryModalProvider>
      <UIModeProvider>
        <ToastViewport />
        <MascotCompanion />
        <AnimatePresence mode="sync">
          <Routes location={location} key={topLevelRouteKey}>
          {import.meta.env.DEV ? <Route path="/__dev/editor" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <DevEditorPage />
                </AnimatedPage>
              </Suspense>} /> : null}
          {import.meta.env.DEV ? <Route path="/__dev/collab" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <CollabDemoPage />
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
          <Route path="/docs/*" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                  <AnimatedPage>
                    <DocsPage />
                  </AnimatedPage>
                </Suspense></PublicPageWithFooter>} />
          <Route path="/privacy" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <PrivacyPolicyPage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/terms" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <TermsOfUsePage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/cookies" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <CookiePolicyPage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/refunds" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <RefundPolicyPage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/pricing" element={<Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <PricingPage />
                </AnimatedPage>
              </Suspense>} />
          <Route path="/support" element={<RequireToken><PublicPageWithFooter>
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <SupportPage />
                    </AnimatedPage>
                  </Suspense>
              </PublicPageWithFooter></RequireToken>} />
          <Route path="/support/desk" element={<RequireToken><SupportDeskGuard><Suspense fallback={<PageLoader />}>
                  <AnimatedPage>
                    <SupportDeskPage />
                  </AnimatedPage>
                </Suspense></SupportDeskGuard></RequireToken>} />
          <Route path="/blog" element={<RequireToken><PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <BlogPage />
                    </AnimatedPage>
                  </Suspense></PublicPageWithFooter></RequireToken>} />
          <Route path="/blog/admin" element={<RequireToken>
                <StandaloneShell current="blog">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <BlogAdminPage />
                    </AnimatedPage>
                  </Suspense>
                </StandaloneShell>
              </RequireToken>} />
          <Route path="/blog/tag/:tag" element={<RequireToken><PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <BlogPage />
                    </AnimatedPage>
                  </Suspense></PublicPageWithFooter></RequireToken>} />
          <Route path="/blog/:slug" element={<RequireToken><PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <BlogPostPage />
                    </AnimatedPage>
                  </Suspense></PublicPageWithFooter></RequireToken>} />
          <Route path="/profile/certificates" element={<RequireToken>
                <StandaloneShell current="profile">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <ProfileCertificatesPage />
                    </AnimatedPage>
                  </Suspense>
                </StandaloneShell>
              </RequireToken>} />
          <Route path="/certificate/:certificateId" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <CertificateVerifyPage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/lab/library" element={<RequireToken><PersonalRouteShell area="lab"><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <TaskLibraryPage />
                </AnimatedPage>
              </Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/library" element={<Navigate to="/lab/library" replace />} />
          <Route path="/lab/library/solve/:taskKey" element={<RequireToken><PersonalRouteShell area="lab"><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <LibraryTaskSolvePage />
                </AnimatedPage>
              </Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/library/solve/:taskKey" element={<RequireToken><PersonalRouteShell area="lab"><Suspense fallback={<PageLoader />}><AnimatedPage><LibraryTaskSolvePage /></AnimatedPage></Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/playground" element={<RequireToken>
                <PersonalRouteShell area="lab">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <PlaygroundPage />
                    </AnimatedPage>
                  </Suspense>
                </PersonalRouteShell>
              </RequireToken>} />
          <Route path="/lab/playground" element={<RequireToken><PersonalRouteShell area="lab">
                <Suspense fallback={<PageLoader />}><AnimatedPage><PlaygroundPage /></AnimatedPage></Suspense>
              </PersonalRouteShell></RequireToken>} />
          <Route path="/playground/:shareId" element={<RequireToken><PersonalRouteShell area="lab"><Suspense fallback={<PageLoader />}><AnimatedPage><PlaygroundPage /></AnimatedPage></Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/lab/practice" element={<RequireToken><PersonalRouteShell area="lab"><Suspense fallback={<PageLoader />}>
                <AnimatedPage><LabPracticePage /></AnimatedPage>
              </Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/learn" element={<RequireToken><Navigate to="/learning/catalog" replace /></RequireToken>} />
          <Route path="/learning/catalog" element={<RequireToken>
                <PersonalRouteShell>
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <LearningCatalogPage />
                    </AnimatedPage>
                  </Suspense>
                </PersonalRouteShell>
              </RequireToken>} />
          <Route path="/learning/course/:courseId" element={<RequireToken><LegacyCourseRouteRedirect /></RequireToken>} />
          <Route path="/learning/course/:courseId/overview" element={<RequireToken>
                <PersonalRouteShell courseTab="overview">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage><PersonalCourseDashboard /></AnimatedPage>
                  </Suspense>
                </PersonalRouteShell>
              </RequireToken>} />
          <Route path="/learning/course/:courseId/path" element={<RequireToken><PersonalRouteShell courseTab="path"><Suspense fallback={<PageLoader />}><AnimatedPage><LearningCoursePage /></AnimatedPage></Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/learning/course/:courseId/practice/:courseItemId" element={<RequireToken><PersonalRouteShell courseTab="practice"><Suspense fallback={<PageLoader />}><AnimatedPage><CoursePracticePage /></AnimatedPage></Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/learning/course/:courseId/progress" element={<RequireToken><PersonalRouteShell courseTab="progress"><Suspense fallback={<PageLoader />}><AnimatedPage><CourseProgressPage /></AnimatedPage></Suspense></PersonalRouteShell></RequireToken>} />
          <Route path="/invite/:token" element={<RequireToken>
                <StandaloneShell current="learn">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <AcceptInvitePage />
                    </AnimatedPage>
                  </Suspense>
                </StandaloneShell>
              </RequireToken>} />
          <Route path="/replay/:id" element={<RequireToken>
                <StandaloneShell current="grades">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <SolveReplayPage />
                    </AnimatedPage>
                  </Suspense>
                </StandaloneShell>
              </RequireToken>} />
          <Route path="/contests/:id/scoreboard" element={<Navigate to="/contest/contests" replace />} />
          <Route path="/profile" element={<RequireToken>
                <Navigate to="/?app=profile" replace />
              </RequireToken>} />
          <Route path="/tasks" element={<RequireToken>
                <LegacyAppPageRedirect page="tasks" />
              </RequireToken>} />
          <Route path="/grades" element={<RequireToken>
                <LegacyAppPageRedirect page="grades" />
              </RequireToken>} />
          <Route path="/admin" element={<RequireToken>
                <Navigate to="/?app=admin" replace />
              </RequireToken>} />
          <Route path="/dashboard" element={<RequireToken>
                <Navigate to="/" replace />
              </RequireToken>} />
          <Route path="/contests" element={<Navigate to="/contest/contests" replace />} />
          <Route path="/contests/:id" element={<Navigate to="/contest/contests" replace />} />
          <Route path="/contests/:id/problems/:problemId" element={<Navigate to="/contest/contests" replace />} />
          <Route path="/u/:username" element={<PublicPageWithFooter><Suspense fallback={<PageLoader />}>
                <AnimatedPage>
                  <PublicProfilePage />
                </AnimatedPage>
              </Suspense></PublicPageWithFooter>} />
          <Route path="/iad" element={<RequireToken>
                <StandaloneShell current="profile">
                  <Suspense fallback={<PageLoader />}>
                    <AnimatedPage>
                      <IadPage />
                    </AnimatedPage>
                  </Suspense>
                </StandaloneShell>
              </RequireToken>} />
          <Route path="/difus" element={<Navigate to="/iad" replace />} />
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

const SupportDeskGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const preview = import.meta.env.DEV && ["1", "true"].includes(new URLSearchParams(location.search).get("preview") || "");
  const [state, setState] = React.useState<"checking" | "allowed" | "denied">(preview ? "allowed" : "checking");

  React.useEffect(() => {
    if (preview) return;
    let active = true;
    getMe({ force: true, suppressAuthRedirect: true })
      .then((user) => active && setState(user.role === "SUPPORT" || user.role === "SYSTEM_ADMIN" ? "allowed" : "denied"))
      .catch(() => active && setState("denied"));
    return () => { active = false; };
  }, [preview]);

  if (state === "checking") return <PageLoader />;
  if (state === "denied") return <Navigate to="/support" replace />;
  return <>{children}</>;
};

const RequireToken: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const previewValue = new URLSearchParams(location.search).get("preview");
  const devPreview = import.meta.env.DEV && (previewValue === "1" || previewValue === "true");
  const [cookieSessionStatus, setCookieSessionStatus] = React.useState<"checking" | "valid" | "missing">("checking");

  React.useEffect(() => {
    let cancelled = false;
    if (devPreview) {
      setCookieSessionStatus("valid");
      return;
    }
    setCookieSessionStatus("checking");
    getMe({ force: true, suppressAuthRedirect: true })
      .then(() => {
        if (!cancelled) setCookieSessionStatus("valid");
      })
      .catch(() => {
        if (!cancelled) setCookieSessionStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [devPreview, location.pathname, location.search]);

  if (!devPreview && cookieSessionStatus === "checking") {
    return <PageLoader />;
  }

  if (!devPreview) {
    if (cookieSessionStatus === "valid") return <>{children}</>;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/?auth=login&next=${next}`} replace />;
  }
  return <>{children}</>;
};

const ContestRoutes: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const isDevPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";

  useEffect(() => {
    if (isDevPreview) {
      setUser({
        id: -301,
        username: "contest-preview",
        firstName: "Марко",
        activeRuntime: "PYTHON",
        difus: 0,
        avatarUrl: null,
        userMode: "CONTEST",
      });
      setReady(true);
      return;
    }
    let active = true;
    getMe({ force: true, suppressAuthRedirect: true })
      .then((nextUser) => {
        if (!active) return;
        if (nextUser.userMode !== "CONTEST") {
          navigate("/", { replace: true });
          return;
        }
        setUser(nextUser);
      })
      .catch(() => active && setUser(null))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [navigate, location.search]);

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

  return <PremiumModuleShell product="CONTEST" user={user} theme={theme} currentPath={location.pathname} onNavigate={navigate} onToggleTheme={toggleTheme} onLogout={() => {
    void api.post("/auth/logout", undefined, { headers: { "X-Skip-Auth-Redirect": "1" } }).catch(() => undefined);
    clearControlExamSession();
    navigate("/contest", { replace: true });
    window.location.reload();
  }}>
      <main className="min-h-0 overflow-y-auto">
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
    </PremiumModuleShell>;
});
ContestRoutes.displayName = "ContestRoutes";

const EduRoutes: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEduDevPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";
  const eduPreviewPersona = new URLSearchParams(location.search).get("persona");
  const eduPreviewStudent = eduPreviewPersona !== "teacher" && (
    eduPreviewPersona === "student" || (/^\/edu\/(journal|lessons(?:\/|$)|tasks\/|grades\/|appeals(?:\/|$))/).test(location.pathname)
  );
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
  const [controlExamSession, setControlExamSession] = useState(() => getControlExamSession());
  useEffect(() => {
    const unsubscribe = subscribeControlExamSession(() => {
      setControlExamSession(getControlExamSession());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!controlExamSession) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;
    const controlWorkId = controlExamSession.controlWorkId;

    // Release the kiosk lock and bounce off the (now-gone) exam page so the
    // student can never be permanently trapped on a black screen.
    const releaseKiosk = () => {
      clearControlExamSession();
      const currentPath = typeof window !== "undefined" ? window.location.pathname : location.pathname;
      if (/^\/edu\/(lessons\/\d+|tasks\/\d+)\/?$/i.test(currentPath)) {
        navigate("/edu/lessons", { replace: true });
      }
    };

    const validateControlSession = async () => {
      try {
        const status = await getControlWorkStatus(controlWorkId);
        if (cancelled) return;

        if (status.status !== "IN_PROGRESS") {
          releaseKiosk();
        }
      } catch (error: unknown) {
        if (cancelled) return;

        const response = error && typeof error === "object" ? Reflect.get(error, "response") : null;
        const rawStatus = response && typeof response === "object" ? Reflect.get(response, "status") : null;
        const statusCode = typeof rawStatus === "number" ? rawStatus : null;

        // Definitive answer from our API: the work was recalled / deadline passed
        // / isn't this student's / no longer exists → the session is stale.
        const isStaleSession =
          statusCode === 400 || statusCode === 403 || statusCode === 404 ||
          statusCode === 409 || statusCode === 410;
        if (isStaleSession) {
          releaseKiosk();
          return;
        }

        // Transient failure (5xx / network blip): retry a few times, but never
        // leave the student locked forever — release after the retries run out.
        attempts += 1;
        if (attempts < 5) {
          retryTimer = window.setTimeout(() => {
            void validateControlSession();
          }, 2000);
          return;
        }
        releaseKiosk();
      }
    };

    void validateControlSession();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [controlExamSession?.controlWorkId, navigate]);

  useEffect(() => {
    if (!controlExamSession) return;

    if (!isPathAllowedInControlExam(location.pathname, controlExamSession.controlWorkId)) {
      navigate(`/edu/lessons/${controlExamSession.controlWorkId}?type=CONTROL`, {
        replace: true
      });
    }
  }, [controlExamSession?.controlWorkId, location.pathname, navigate]);

  useEffect(() => {
    if (isEduDevPreview) {
      setUser({
        id: eduPreviewStudent ? -202 : -201,
        username: eduPreviewStudent ? "student-preview" : "teacher-preview",
        firstName: eduPreviewPersona === "student" ? "Софія" : "Ірина",
        activeRuntime: "PYTHON",
        difus: 74,
        avatarUrl: null,
        userMode: "EDUCATIONAL",
        role: eduPreviewStudent ? "USER" : "TEACHER",
        ...(eduPreviewStudent ? { studentId: -202, classId: -31, className: "10-Б" } : {}),
        ...(eduPreviewPersona === "student" ? { studentId: -202, classId: -31, className: "10-Б" } : {}),
      });
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        let u = await getCurrentUserWithRetry(6);
        if (cancelled) return;

        if (u.userMode !== "EDUCATIONAL") {
          navigate("/", {
            replace: true
          });
          return;
        }
        // A User-backed account with only student memberships should enter its
        // linked Student context automatically. Accounts that also teach stay
        // in the staff context until the user explicitly switches context.
        const hasStaffContext = u.eduContexts?.organizations?.some((org) => ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(org.role)) ?? false;
        const firstStudent = u.eduContexts?.students?.[0];
        if (!u.studentId && !hasStaffContext && firstStudent) {
          setActiveEduStudentId(firstStudent.studentId);
          u = await getMe({ force: true, suppressAuthRedirect: true });
        }
        setUser(u);
      } catch (error: unknown) {
        if (cancelled) return;

        const status = getHttpStatusFromError(error);
        if (import.meta.env.DEV) {
          console.error("EduRoutes: Failed to get user", error);
        }
        if (isAuthErrorStatus(status)) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate, isEduDevPreview, eduPreviewStudent]);
  const handleAuth = useCallback((u: User) => {
    setUser(u);
  }, []);
  const handleEduContextChange = useCallback(async (studentId: number | null) => {
    setActiveEduStudentId(studentId);
    try {
      const next = await getMe({ force: true, suppressAuthRedirect: true });
      if (next.userMode === "EDUCATIONAL") {
        setUser(next);
        navigate(studentId == null ? "/edu" : "/edu/lessons", { replace: true });
      }
    } catch (error) {
      // Keep the current screen if a context refresh fails; the next request
      // still carries the selected context and can recover after retry.
      if (import.meta.env.DEV) console.error("Edu context switch failed", error);
    }
  }, [navigate]);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);
  const isControlExamActive = !!controlExamSession;
  if (loading) {
    return <PageLoader />;
  }
  if (!user) {
    return <Suspense fallback={<PageLoader />}>
      <AuthPage onAuth={handleAuth} />
    </Suspense>;
  }
  const teacherOnly = (element: React.ReactElement) => user.studentId ? <Navigate to="/edu/lessons" replace /> : element;
  const studentOnly = (element: React.ReactElement) => user.studentId ? element : <Navigate to="/edu" replace />;
  const eduMain = <main className={`flex-1 min-h-0 flex flex-col ${/^\/edu\/tasks\//.test(location.pathname) ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {}
            <Route index element={user.studentId ? <Navigate to="/edu/lessons" replace /> : <AnimatedPage>
                    <TeacherDashboardPage />
                  </AnimatedPage>} />
            <Route path="classes/:classId" element={teacherOnly(<AnimatedPage><ClassDetailsPage /></AnimatedPage>)} />
            <Route path="classes/:classId/teacher-os" element={teacherOnly(<Navigate to=".." relative="path" replace />)} />
            <Route path="classes/:classId/lessons/new" element={teacherOnly(<AnimatedPage><CreateLessonPage /></AnimatedPage>)} />
            <Route path="classes/:classId/topics/new" element={teacherOnly(<AnimatedPage><CreateTopicPage /></AnimatedPage>)} />
            <Route path="topics/:topicId" element={teacherOnly(<AnimatedPage><TopicDetailsPage /></AnimatedPage>)} />
            <Route path="library" element={<AnimatedPage><TaskLibraryPage /></AnimatedPage>} />
            <Route path="library/solve/:taskKey" element={<AnimatedPage><LibraryTaskSolvePage /></AnimatedPage>} />
            <Route path="control-works/:controlWorkId" element={teacherOnly(<AnimatedPage><ControlWorkDetailsPage /></AnimatedPage>)} />
            <Route path="classes/:classId/summary-grades" element={teacherOnly(<AnimatedPage><SummaryGradesPage /></AnimatedPage>)} />
            <Route path="classes/:classId/gradebook" element={teacherOnly(<AnimatedPage><ClassGradebookPage /></AnimatedPage>)} />
            <Route path="classes/:classId/attendance" element={teacherOnly(<AnimatedPage><AttendancePage /></AnimatedPage>)} />
            <Route path="classes/:classId/similarity" element={<Navigate to="../gradebook" relative="path" replace />} />
            <Route path="classes/:classId/gradebook-config" element={<Navigate to="../gradebook" relative="path" replace />} />
            <Route path="join" element={<AnimatedPage><JoinClassPage /></AnimatedPage>} />
            <Route path="courses" element={teacherOnly(<AnimatedPage><CoursesPage /></AnimatedPage>)} />
            <Route path="calendar" element={<AnimatedPage><CalendarPage /></AnimatedPage>} />
            <Route path="tutor" element={<AnimatedPage><TutorPage /></AnimatedPage>} />
            <Route path="parent" element={<AnimatedPage><ParentDashboardPage /></AnimatedPage>} />
            <Route path="courses/:courseId" element={teacherOnly(<AnimatedPage><CourseDetailPage /></AnimatedPage>)} />
            <Route path="lessons/:lessonId/quiz" element={studentOnly(<AnimatedPage><LessonQuizPage /></AnimatedPage>)} />
            <Route path="lessons/:lessonId/quiz/review" element={teacherOnly(<AnimatedPage><TeacherQuizReviewPage /></AnimatedPage>)} />
            <Route path="manual-tasks/:taskId" element={studentOnly(<AnimatedPage><ManualTaskPage /></AnimatedPage>)} />
            <Route path="manual-tasks/:taskId/submissions" element={teacherOnly(<AnimatedPage><ManualTaskSubmissionsPage /></AnimatedPage>)} />
            <Route path="organization" element={teacherOnly(<AnimatedPage><OrgMembersPage /></AnimatedPage>)} />
            <Route path="profile" element={<Navigate to="/profile" replace />} />
            <Route path="classes/:classId/live" element={teacherOnly(<AnimatedPage><LiveClassroomPage user={user} /></AnimatedPage>)} />
            <Route path="classes/:classId/appeals" element={teacherOnly(<AnimatedPage><TeacherClassAppealsPage /></AnimatedPage>)} />
            <Route path="journal" element={studentOnly(<AnimatedPage><StudentDashboardPage user={user} /></AnimatedPage>)} />
            <Route path="student" element={<Navigate to="/edu/journal" replace />} />
            <Route path="lessons" element={studentOnly(<AnimatedPage><StudentLessonsPage /></AnimatedPage>)} />
            <Route path="lessons/:lessonId" element={studentOnly(<AnimatedPage><LessonDetailsPage student={Boolean(user.studentId)} /></AnimatedPage>)} />
            <Route path="tasks/:taskId" element={studentOnly(<AnimatedPage><StudentTaskPage /></AnimatedPage>)} />
            <Route path="grades/:gradeId" element={<Navigate to="/edu/journal" replace />} />
            <Route path="appeals" element={studentOnly(<AnimatedPage><StudentAppealsPage /></AnimatedPage>)} />
            <Route path="docs" element={<AnimatedPage><DocsPage /></AnimatedPage>} />
            {}
            <Route path="*" element={<Navigate to={user.studentId ? "/edu/lessons" : "/edu"} replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </main>;

  return <PremiumModuleShell
      product="EDU"
      user={user}
      theme={theme}
      currentPath={location.pathname}
      navigationHidden={isControlExamActive}
      onNavigate={navigate}
      onToggleTheme={toggleTheme}
      onEduContextChange={handleEduContextChange}
      onLogout={() => {
        void api.post("/auth/logout", undefined, { headers: { "X-Skip-Auth-Redirect": "1" } }).catch(() => undefined);
        setActiveEduStudentId(null);
        clearControlExamSession();
        navigate("/");
      }}
    >
      {eduMain}
    </PremiumModuleShell>;

});
EduRoutes.displayName = "EduRoutes";
const VerifyEmailWrapper: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const handleAuth = useCallback((_u: User) => {
    navigate("/");
  }, [navigate]);
  return <Suspense fallback={<PageLoader />}>
      <VerifyEmailPage onAuth={handleAuth} />
    </Suspense>;
});
VerifyEmailWrapper.displayName = "VerifyEmailWrapper";
const GoogleAuthWrapper: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const handleAuth = useCallback((_user: User) => {
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
  const exchangeAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    const attemptKey = code ? `code:${code}` : token ? `token:${token}` : "cookie:success";
    if (exchangeAttemptRef.current === attemptKey) return;
    exchangeAttemptRef.current = attemptKey;
    let cancelled = false;
    const finishSuccess = () => {
      sessionStorage.setItem("fromAuth", "true");
      window.location.replace("/");
    };

    const run = async () => {
      if (code) {
        try {
          const exchanged = await exchangeGoogleCode(code, "success");
          if (cancelled) return;
          if (exchanged.flow === "success") {
            finishSuccess();
            return;
          }
          navigate("/auth/google/error?reason=INVALID_TOKEN", { replace: true });
          return;
        } catch {
          if (cancelled) return;
          navigate("/auth/google/error?reason=EXCHANGE_FAILED", { replace: true });
          return;
        }
      }

      if (token) {
        // Legacy token-in-query redirects are intentionally rejected. The
        // current Google flow uses a one-time code and sets the httpOnly cookie
        // during exchange.
        window.location.replace("/auth/google/error?reason=LEGACY_TOKEN_FLOW");
        return;
      }

      try {
        const exchanged = await exchangeGoogleCookie("success");
        if (cancelled) return;
        if (exchanged.flow === "success") {
          finishSuccess();
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
  const [searchParams] = useSearchParams();
  const reason = String(searchParams.get("reason") ?? "").trim();
  const message = (() => {
    if (reason === "GOOGLE_OAUTH_DISABLED") {
      return t("googleAuthError") + " " + "Google OAuth is not configured.";
    }
    if (reason === "GOOGLE_LINK_SESSION_REQUIRED") {
      return t("googleAuthError") + " " + "Please start Google linking again from your profile.";
    }
    if (reason === "GOOGLE_ACCOUNT_ALREADY_LINKED") {
      return t("googleAuthError") + " " + "This Google account is already linked to another profile.";
    }
    if (reason === "INVALID_TOKEN") {
      return t("googleAuthError") + " " + "The received authorization token is invalid.";
    }
    if (reason === "EXCHANGE_FAILED") {
      return t("googleAuthError") + " " + "Failed to exchange authorization code for a session. Please try again.";
    }
    return t("googleAuthError");
  })();
  return <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
          {message}
        </div>
        <Button onClick={() => navigate("/")} className="w-full mt-4">
          {t("backToHome")}
        </Button>
      </div>
    </div>;
});
GoogleAuthErrorPage.displayName = "GoogleAuthErrorPage";
