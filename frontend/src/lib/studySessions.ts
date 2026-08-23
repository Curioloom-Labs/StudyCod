const STORAGE_KEY = "studycod.studySessions.successCount.v1";

function getSuccessfulStudySessions(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const count = raw ? Number(raw) : 0;
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

function incrementSuccessfulStudySessions(): number {
  const next = getSuccessfulStudySessions() + 1;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // ignore storage failures
  }
  return next;
}

export function recordSuccessfulStudySession(meta?: {
  kind?: string;
  taskId?: number | string;
  lessonId?: number | string;
}) {
  const count = incrementSuccessfulStudySessions();
  try {
    window.dispatchEvent(
      new CustomEvent("studycod:studySessionSuccess", {
        detail: {
          count,
          ...meta
        }
      })
    );
  } catch {
    // ignore event failures
  }
}
