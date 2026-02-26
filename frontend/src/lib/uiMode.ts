export type UIMode = "classic" | "focus";

const STORAGE_KEYS = {
  preference: "studycod.uiMode.preference",
  override: "studycod.uiMode.override",
  introSeen: "studycod.uiMode.focusIntroSeen.v1",
  studySessions: "studycod.studySessions.successCount.v1",
  switchSuggestionDismissed: "studycod.uiMode.switchSuggestionDismissed.v1"
} as const;

type OverrideState = {
  mode: UIMode;
  expiresAt: number; // epoch ms
};

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

export function parseUIMode(value: unknown): UIMode | null {
  return value === "classic" || value === "focus" ? value : null;
}

export function getPreferredUIMode(): UIMode | null {
  const raw = safeLocalStorage.get(STORAGE_KEYS.preference);
  return parseUIMode(raw);
}

export function setPreferredUIMode(mode: UIMode) {
  safeLocalStorage.set(STORAGE_KEYS.preference, mode);
}

export function getOverrideUIMode(now = Date.now()): OverrideState | null {
  const raw = safeLocalStorage.get(STORAGE_KEYS.override);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OverrideState>;
    const mode = parseUIMode(parsed.mode);
    const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : null;
    if (!mode || !expiresAt) return null;
    if (expiresAt <= now) return null;
    return {
      mode,
      expiresAt
    };
  } catch {
    return null;
  }
}

export function setUIModeOverride(mode: UIMode, expiresAt: number) {
  const payload: OverrideState = {
    mode,
    expiresAt
  };
  safeLocalStorage.set(STORAGE_KEYS.override, JSON.stringify(payload));
}

export function clearUIModeOverride() {
  safeLocalStorage.remove(STORAGE_KEYS.override);
}

export function getEffectiveUIMode(now = Date.now()): {
  mode: UIMode;
  source: "override" | "preference" | "default";
} {
  const override = getOverrideUIMode(now);
  if (override) {
    return {
      mode: override.mode,
      source: "override"
    };
  }
  const pref = getPreferredUIMode();
  if (pref) {
    return {
      mode: pref,
      source: "preference"
    };
  }
  // Default after this update: start in Focus interface.
  return {
    mode: "focus",
    source: "default"
  };
}

export function isFocusIntroSeen(): boolean {
  return safeLocalStorage.get(STORAGE_KEYS.introSeen) === "1";
}

export function markFocusIntroSeen() {
  safeLocalStorage.set(STORAGE_KEYS.introSeen, "1");
}

export function getSuccessfulStudySessions(): number {
  const raw = safeLocalStorage.get(STORAGE_KEYS.studySessions);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function incrementSuccessfulStudySessions(): number {
  const next = getSuccessfulStudySessions() + 1;
  safeLocalStorage.set(STORAGE_KEYS.studySessions, String(next));
  return next;
}

export function isSwitchSuggestionDismissed(): boolean {
  return safeLocalStorage.get(STORAGE_KEYS.switchSuggestionDismissed) === "1";
}

export function dismissSwitchSuggestion() {
  safeLocalStorage.set(STORAGE_KEYS.switchSuggestionDismissed, "1");
}

export function endOfLocalDayEpochMs(date = new Date()): number {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
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
    // ignore
  }
}
