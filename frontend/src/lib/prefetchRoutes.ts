import type { MomentumNavTarget } from "../layout/momentum/MomentumShell";

/**
 * Warms the route chunks used by App.tsx's React.lazy declarations so that
 * hovering/focusing a nav item starts downloading the target page's code
 * before the user clicks. Import paths must mirror App.tsx exactly so Vite
 * resolves them to the same chunks.
 */

const prefetched = new Set<string>();

type ConnectionAware = Navigator & { connection?: { saveData?: boolean } };

function saveDataEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as ConnectionAware).connection?.saveData === true;
}

const NAV_IMPORTS: Record<MomentumNavTarget, () => Promise<unknown>> = {
  continue: () => import("../pages/core/HomePage"),
  lessons: () => import("../pages/edu/StudentLessonsPage"),
  tasks: () => import("../pages/core/TasksPage"),
  grades: () => import("../pages/core/GradesPage"),
  student: () => import("../pages/edu/StudentDashboardPage"),
  teacher: () => import("../pages/edu/TeacherDashboardPage"),
  admin: () => import("../pages/system/AdminDashboardPage"),
  profile: () => import("../pages/profile/ProfilePage"),
  library: () => import("../pages/library/TaskLibraryPage"),
  contests: () => import("../pages/contest/ContestsPage"),
  playground: () => import("../pages/system/PlaygroundPage"),
  learn: () => import("../pages/edu/MyLearningPage"),
  support: () => import("../pages/system/SupportPage"),
  blog: () => import("../pages/system/BlogPage")
};

const PATH_IMPORTS: Record<string, () => Promise<unknown>> = {
  "/docs": () => import("../pages/system/DocsPage"),
  "/support": () => import("../pages/system/SupportPage"),
  "/edu/library": () => import("../pages/library/TaskLibraryPage")
};

function warm(key: string, load: () => Promise<unknown>): void {
  if (saveDataEnabled()) return;
  if (prefetched.has(key)) return;
  prefetched.add(key);
  load().catch(() => {});
}

export function prefetchNavTarget(target: MomentumNavTarget): void {
  const load = NAV_IMPORTS[target];
  if (load) warm(`nav:${target}`, load);
}

export function prefetchPath(path: string): void {
  for (const prefix of Object.keys(PATH_IMPORTS)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      warm(`path:${prefix}`, PATH_IMPORTS[prefix]);
      return;
    }
  }
}
