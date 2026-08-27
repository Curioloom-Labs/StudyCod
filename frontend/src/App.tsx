import React, { useEffect, useState, Suspense, useCallback, useMemo, useRef, startTransition } from "react";
import { Routes, Route, useLocation, useNavigate, useSearchParams, useParams, Navigate } from "react-router-dom";
import { enforceSubdomain, getHostContext } from "./lib/subdomain";
import { AnimatePresence } from "framer-motion";
import { getCachedMeUser, getMe } from "./lib/api/profile";
import type { User } from "./types";
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
import { isResumableSession, loadResumeState, resolveResumeRoute } from "./lib/resumeState";
import { applyTheme, getCurrentTheme, type AppTheme } from "./theme";
import { getMaintenanceStatus } from "./lib/api/maintenance";
import { getGeoStatus } from "./lib/api/geo";
import { getStoredLanguagePreference, isUkraineCountry, setDetectedCountry } from "./lib/localization";
import type { GeoBlockedPayload } from "./pages/system/GeoBlockedPage";
import { exchangeGoogleCode, exchangeGoogleCookie } from "./lib/api/auth";
import { getControlWorkStatus } from "./lib/api/edu";
import { api } from "./lib/api/client";
import { TheoryModalProvider } from "./components/theory/TheoryModalProvider";
import { ToastViewport } from "./components/ui/ToastViewport";
import { getErrorMessageFromUnknown } from "./lib/safeError";
import { clearControlExamSession, getControlExamSession, isPathAllowedInControlExam, subscribeControlExamSession } from "./lib/controlExamSession";
import { setActiveEduStudentId } from "./lib/eduContext";
import { applySeo } from "./lib/seo";
import { MascotCompanion } from "./components/MascotCompanion";
import { Button } from "./components/ui/Button";
const AuthPage = React.lazy(() => import("./pages/auth/AuthPage").then(mod => ({ default: mod.AuthPage })));
const VerifyEmailPage = React.lazy(() => import("./pages/auth/VerifyEmailPage").then(mod => ({ default: mod.VerifyEmailPage })));
const ResetPasswordPage = React.lazy(() => import("./pages/auth/ResetPasswordPage").then(mod => ({ default: mod.ResetPasswordPage })));
const TasksPage = React.lazy(() => import("./pages/core/TasksPage").then(mod => ({ default: mod.TasksPage })));
const GradesPage = React.lazy(() => import("./pages/core/GradesPage").then(mod => ({ default: mod.GradesPage })));
const ProfilePage = React.lazy(() => import("./pages/profile/ProfilePage").then(mod => ({ default: mod.ProfilePage })));
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
const ClassHubPage = React.lazy(() => import("./pages/edu/ClassHubPage").then(mod => ({ default: mod.ClassHubPage })));
const ClassManagementPage = React.lazy(() => import("./pages/edu/ClassManagementPage").then(mod => ({ default: mod.ClassManagementPage })));
const CreateLessonPage = React.lazy(() => import("./pages/edu/TeacherComposerPages").then(mod => ({ default: mod.CreateLessonWorkspace })));
const CreateTopicPage = React.lazy(() => import("./pages/edu/TeacherComposerPages").then(mod => ({ default: mod.CreateTopicWorkspace })));
const TopicDetailsPage = React.lazy(() => import("./pages/edu/TopicStudioPage").then(mod => ({ default: mod.TopicStudioPage })));
const ControlWorkDetailsPage = React.lazy(() => import("./pages/edu/ControlStudioPage").then(mod => ({ default: mod.ControlStudioPage })));
const StudentDashboardPage = React.lazy(() => import("./pages/edu/StudentJournalPage").then(mod => ({ default: mod.StudentJournalPage })));
const StudentLessonsPage = React.lazy(() => import("./pages/edu/StudentPathPages").then(mod => ({ default: mod.StudentLessonsWorkspace })));
const LessonDetailsPage = React.lazy(() => import("./pages/edu/LessonStudioPage").then(mod => ({ default: mod.LessonStudioPage })));
const StudentTaskPage = React.lazy(() => import("./pages/edu/PracticeCanvasPage").then(mod => ({ default: mod.PracticeCanvasPage })));
const StudentAppealsPage = React.lazy(() => import("./pages/edu/StudentAppealsPage"));
const TeacherClassAppealsPage = React.lazy(() => import("./pages/edu/EducationOperationsPages").then(mod => ({ default: mod.TeacherAppealsWorkspace })));
const SummaryGradesPage = React.lazy(() => import("./pages/edu/TeacherDataPages").then(mod => ({ default: mod.SummaryGradesWorkspace })));
const ClassGradebookPage = React.lazy(() => import("./pages/edu/TeacherDataPages").then(mod => ({ default: mod.GradebookWorkspace })));
const JoinClassPage = React.lazy(() => import("./pages/edu/StudentPathPages").then(mod => ({ default: mod.JoinClassWorkspace })));
const CoursesPage = React.lazy(() => import("./pages/edu/CourseStudioPages").then(mod => ({ default: mod.CourseStudioPage })));
const CalendarPage = React.lazy(() => import("./pages/edu/AgendaWorkspacePage").then(mod => ({ default: mod.AgendaWorkspacePage })));
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
const PublicNotFoundPage = React.lazy(() => import("./pages/public/PublicStatusPage").then(mod => ({ default: mod.PublicNotFoundPage })));
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
  if (page === "teacher") return user.role !== "SYSTEM_ADMIN" && user.userMode === "EDUCATIONAL" && !user.studentId;
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

const getCurrentUserWithRetry = async (maxAttempts = 3, force = false): Promise<User> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Boot-time session probing must never trigger the global 401 redirect.
      // The app needs to render the auth screen when this request is expected
      // to fail (for example on /?auth=login).
      return await getMe({ force, suppressAuthRedirect: true });
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
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [loading, setLoading] = useState(true);
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
    // If an already authenticated session lands on an auth URL, consume the
    // protected destination instead of rendering the app under a stale
    // ?auth=login&next=... address.
    if (!user || !bootResumeHandled || location.pathname !== "/") return;
    if (!searchParams.has("auth") && !searchParams.has("next")) return;

    const next = getSafeNextAfterAuth(searchParams);
    if (next) {
      navigate(next, { replace: true });
      return;
    }

    const clean = new URLSearchParams(searchParams);
    clean.delete("auth");
    clean.delete("next");
    const search = clean.toString();
    navigate({ pathname: "/", search: search ? `?${search}` : "" }, { replace: true });
  }, [user?.id, bootResumeHandled, location.pathname, searchParams, navigate]);

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
          return;
        }
      if (newPage === "tasks") { navigate("/lab/practice?workspace=personal"); return; }
      if (newPage === "grades") { navigate("/learning/catalog"); return; }
    }
    startTransition(() => {
      setPage(newPage);
    });
  }, [navigate, user?.userMode]);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: AppTheme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);
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
  if (location.pathname !== "/") {
    return <Suspense fallback={<PageLoader />}>
      <PublicNotFoundPage />
    </Suspense>;
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
        return <PersonalCourseDashboard />;
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

  if (resolvedPage === "admin" && user.role === "SYSTEM_ADMIN") {
    return <PremiumModuleShell
      product="ADMIN"
      user={user}
      theme={theme}
      currentPath={location.pathname}
      onNavigate={navigate}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
    >
      <main id="main-content" className="min-h-0 overflow-y-auto">
        <Suspense fallback={<PageLoader />}>
          <AdminWorkspacePage />
        </Suspense>
      </main>
    </PremiumModuleShell>;
  }

  return <PremiumModuleShell
    product="EDU"
    user={user}
    theme={theme}
    currentPath={location.pathname}
    onNavigate={navigate}
    onToggleTheme={toggleTheme}
    onLogout={handleLogout}
  >
    <main id="main-content" className="min-h-0 overflow-y-auto">{content}</main>
    <Suspense fallback={null}>
      <PlacementEntry user={user} onUserChange={setUser} />
    </Suspense>
    <Suspense fallback={null}>
      <OnboardingEntry />
    </Suspense>
  </PremiumModuleShell>;
});
AppContent.displayName = "AppContent";
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
  const [cookieSessionStatus, setCookieSessionStatus] = React.useState<"checking" | "valid" | "missing" | "unavailable">(
    () => getCachedMeUser() ? "valid" : "checking"
  );

  React.useEffect(() => {
    let cancelled = false;
    if (devPreview) {
      setCookieSessionStatus("valid");
      return;
    }
    setCookieSessionStatus("checking");
    // Query-string changes (for example selecting a task) must not re-run the
    // auth probe. A transient 429/5xx also must not be mistaken for logout.
    getMe({ suppressAuthRedirect: true })
      .then(() => {
        if (!cancelled) setCookieSessionStatus("valid");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = getHttpStatusFromError(error);
        setCookieSessionStatus(isAuthErrorStatus(status) ? "missing" : "unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [devPreview, location.pathname]);

  if (!devPreview && cookieSessionStatus === "checking") {
    return <PageLoader />;
  }

  if (!devPreview) {
    if (cookieSessionStatus === "valid") return <>{children}</>;
    if (cookieSessionStatus === "unavailable") {
      return (
        <main className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-amber-300/40 bg-amber-50 p-6 text-center text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Сесію тимчасово не вдалося перевірити</p>
            <p className="mt-2 text-sm opacity-80">Спробуй оновити сторінку через кілька секунд.</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>Оновити</Button>
          </div>
        </main>
      );
    }
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
      <main id="main-content" className="min-h-0 overflow-y-auto">
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
        let u = await getCurrentUserWithRetry(6, true);
        if (cancelled) return;

        const hasStaffContext = u.eduContexts?.organizations?.some((org) => ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(org.role)) ?? false;
        if (u.userMode !== "EDUCATIONAL" && u.role !== "SYSTEM_ADMIN" && !hasStaffContext) {
          navigate("/", {
            replace: true
          });
          return;
        }
        // A User-backed account with only student memberships should enter its
        // linked Student context automatically. Accounts that also teach stay
        // in the staff context until the user explicitly switches context.
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

  if (user.role === "SYSTEM_ADMIN" && !user.studentId && location.pathname === "/edu") {
    return <PremiumModuleShell
      product="ADMIN"
      user={user}
      theme={theme}
      currentPath={location.pathname}
      onNavigate={navigate}
      onToggleTheme={toggleTheme}
      onLogout={() => {
        void api.post("/auth/logout", undefined, { headers: { "X-Skip-Auth-Redirect": "1" } }).catch(() => undefined);
        setActiveEduStudentId(null);
        clearControlExamSession();
        navigate("/");
      }}
    >
      <main className="min-h-0 overflow-y-auto">
        <Suspense fallback={<PageLoader />}>
          <AdminWorkspacePage />
        </Suspense>
      </main>
    </PremiumModuleShell>;
  }

  const isOrgAdmin = user.eduContexts?.organizations?.some((org) => org.role === "ORG_ADMIN") ?? false;
  if (!user.studentId && isOrgAdmin && location.pathname === "/edu") {
    return <Navigate to="/edu/organization" replace />;
  }
  if (!user.studentId && location.pathname === "/edu/organization" && !isOrgAdmin) {
    return <Navigate to="/edu" replace />;
  }

  const teacherOnly = (element: React.ReactElement) => user.studentId ? <Navigate to="/edu/lessons" replace /> : element;
  const orgAdminOnly = (element: React.ReactElement) => isOrgAdmin ? element : <Navigate to="/edu" replace />;
  const studentOnly = (element: React.ReactElement) => user.studentId ? element : <Navigate to="/edu" replace />;
  const eduMain = <main id="main-content" className={`flex-1 min-h-0 flex flex-col ${/^\/edu\/tasks\//.test(location.pathname) ? "overflow-x-hidden overflow-y-auto" : "overflow-y-auto"}`}>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {}
            <Route index element={user.studentId ? <Navigate to="/edu/lessons" replace /> : <AnimatedPage>
                    <TeacherDashboardPage />
                  </AnimatedPage>} />
            <Route path="classes/:classId" element={teacherOnly(<AnimatedPage><ClassHubPage /></AnimatedPage>)} />
            <Route path="classes/:classId/manage" element={teacherOnly(<AnimatedPage><ClassManagementPage /></AnimatedPage>)} />
            <Route path="classes/:classId/lessons/new" element={teacherOnly(<AnimatedPage><CreateLessonPage /></AnimatedPage>)} />
            <Route path="classes/:classId/topics/new" element={teacherOnly(<AnimatedPage><CreateTopicPage /></AnimatedPage>)} />
            <Route path="topics/:topicId" element={teacherOnly(<AnimatedPage><TopicDetailsPage /></AnimatedPage>)} />
            <Route path="library" element={<AnimatedPage><TaskLibraryPage /></AnimatedPage>} />
            <Route path="library/solve/:taskKey" element={<AnimatedPage><LibraryTaskSolvePage /></AnimatedPage>} />
            <Route path="control-works/:controlWorkId" element={teacherOnly(<AnimatedPage><ControlWorkDetailsPage /></AnimatedPage>)} />
            <Route path="classes/:classId/summary-grades" element={teacherOnly(<AnimatedPage><SummaryGradesPage /></AnimatedPage>)} />
            <Route path="classes/:classId/gradebook" element={teacherOnly(<AnimatedPage><ClassGradebookPage /></AnimatedPage>)} />
            <Route path="classes/:classId/attendance" element={teacherOnly(<Navigate to="../gradebook" relative="path" replace />)} />
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
            <Route path="organization" element={orgAdminOnly(<AnimatedPage><OrgMembersPage /></AnimatedPage>)} />
            <Route path="profile" element={<Navigate to="/profile" replace />} />
            <Route path="classes/:classId/live" element={teacherOnly(<AnimatedPage><LiveClassroomPage user={user} /></AnimatedPage>)} />
            <Route path="classes/:classId/appeals" element={teacherOnly(<AnimatedPage><TeacherClassAppealsPage /></AnimatedPage>)} />
            <Route path="journal" element={studentOnly(<AnimatedPage><StudentDashboardPage user={user} /></AnimatedPage>)} />
            <Route path="student" element={<Navigate to="/edu/journal" replace />} />
            <Route path="lessons" element={studentOnly(<AnimatedPage><StudentLessonsPage /></AnimatedPage>)} />
            <Route path="lessons/:lessonId" element={<AnimatedPage><LessonDetailsPage student={Boolean(user.studentId)} /></AnimatedPage>} />
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
