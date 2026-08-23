import type { User } from "../types";

// Resume state is a presentation-agnostic, route-agnostic memory of the user's
// last meaningful cognitive state. It must not depend on UI mode.
//
// We keep it intentionally small and stable (v1) and store per-user.

export type ResumeKind =
  | "personal_task"
  | "edu_task"
  | "edu_lesson"
  | "teacher_home"
  | "admin_home";

export type ResumeStateV1 = {
  v: 1;
  userId: number;
  kind: ResumeKind;

  // What the user was working on
  taskId?: number;
  lessonId?: number;

  // Current step / section inside the learning flow (string keeps it flexible)
  step?: string; // e.g. "theory", "practice", "solve", "tests", "review"
  stepIndex?: number;

  // Current question in a test/quiz (0-based index)
  questionIndex?: number;

  // Restore place
  // NOTE: some pages have multiple scrollable panes; store both a primary scrollTop
  // and an optional per-container map.
  scrollTop?: number;
  scrollContainer?: string; // e.g. "workspace", "theory", "statement", "queue"
  scrollTopByContainer?: Record<string, number>;

  // Reading anchor (semantic)
  anchorId?: string; // e.g. "h2:intro" or "quiz:q3"

  // Unfinished input references (actual content typically already lives in existing draft keys)
  draftKey?: string;

  // Cursor/selection intent for restoring focus-ready state.
  // (We intentionally avoid storing large text blobs here; actual drafts live under draftKey.)
  cursor?: {
    field?: string; // e.g. "editor", "stdin", "answer"
    start?: number;
    end?: number;
  };

  // When it was last updated
  updatedAt: number; // epoch ms
};

export type ResumeState = ResumeStateV1;

const KEY_PREFIX = "studycod.resume.v1.user.";

// Session is treated as "resumable" only within a limited time window.
// This prevents resurrecting stale contexts after long breaks.
export const RESUME_MAX_AGE_MS = 36 * 60 * 60 * 1000; // 36 hours

const safeLocalStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
};

export function loadResumeState(userId: number): ResumeState | null {
  const raw = safeLocalStorage.get(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeState>;
    if (parsed.v !== 1) return null;
    if (parsed.userId !== userId) return null;
    if (typeof parsed.updatedAt !== "number") return null;
    if (typeof parsed.kind !== "string") return null;
    return parsed as ResumeState;
  } catch {
    return null;
  }
}

export function isResumeExpired(state: ResumeState | null, now = Date.now()): boolean {
  if (!state) return true;
  if (typeof state.updatedAt !== "number") return true;
  return now - state.updatedAt > RESUME_MAX_AGE_MS;
}

export function isResumableSession(user: User, state: ResumeState | null, now = Date.now()): boolean {
  if (!state) return false;
  if (state.userId !== user.id) return false;
  if (isResumeExpired(state, now)) return false;

  if (user.role === "SYSTEM_ADMIN") return true;

  if (user.userMode === "EDUCATIONAL") {
    const isStudent = Boolean(user.studentId);
    if (!isStudent) return true; // teacher dashboard is itself a work surface
    if (state.kind === "edu_task") return typeof state.taskId === "number";
    if (state.kind === "edu_lesson") return typeof state.lessonId === "number";
    return false;
  }

  if (state.kind === "personal_task") return typeof state.taskId === "number";
  return false;
}

export function saveResumeState(next: ResumeState) {
  safeLocalStorage.set(`${KEY_PREFIX}${next.userId}`, JSON.stringify(next));
  try {
    window.dispatchEvent(
      new CustomEvent("studycod:resumeState", {
        detail: next
      })
    );
  } catch {
    // ignore
  }
}

export function clearResumeState(userId: number) {
  safeLocalStorage.remove(`${KEY_PREFIX}${userId}`);
}

export function resolveResumeRoute(user: User, state: ResumeState | null):
  | { type: "path"; path: string }
  | { type: "appPage"; page: "home" | "tasks" | "grades" | "profile" | "teacher" | "student" | "admin"; extras?: { [k: string]: string } }
  | { type: "none" } {
  const resumable = isResumableSession(user, state);

  // Admins
  if (user.role === "SYSTEM_ADMIN") {
    return { type: "appPage", page: "admin" };
  }

  // Educational users
  if (user.userMode === "EDUCATIONAL") {
    const isStudent = Boolean(user.studentId);
    if (!isStudent) {
      // Teacher
      return { type: "appPage", page: "teacher" };
    }

    // Student: prefer resuming into the EDU route that actually contains the working session.
    if (resumable && state?.kind === "edu_task" && typeof state.taskId === "number") {
      return { type: "path", path: `/edu/tasks/${state.taskId}` };
    }
    if (resumable && state?.kind === "edu_lesson" && typeof state.lessonId === "number") {
      return { type: "path", path: `/edu/lessons/${state.lessonId}` };
    }

    // No resumable session: use the current in-app entry surface rather than a
    // lessons index page.
    return { type: "appPage", page: "home" };
  }

  // Personal users
  if (resumable && state?.kind === "personal_task" && typeof state.taskId === "number") {
    return {
      type: "appPage",
      page: "tasks",
      extras: {
        openTaskId: String(state.taskId)
      }
    };
  }

  return { type: "appPage", page: "home" };
}

export function buildResumeState(params: Omit<ResumeStateV1, "v" | "updatedAt"> & { updatedAt?: number }): ResumeState {
  return {
    v: 1,
    updatedAt: params.updatedAt ?? Date.now(),
    userId: params.userId,
    kind: params.kind,
    taskId: params.taskId,
    lessonId: params.lessonId,
    step: params.step,
    stepIndex: params.stepIndex,
    questionIndex: params.questionIndex,
    scrollTop: params.scrollTop,
    scrollContainer: params.scrollContainer,
    scrollTopByContainer: params.scrollTopByContainer,
    anchorId: params.anchorId,
    draftKey: params.draftKey,
    cursor: params.cursor
  };
}
