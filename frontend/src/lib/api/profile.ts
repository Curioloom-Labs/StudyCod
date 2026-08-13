import { api } from "./client";
import type { User, CourseLanguage, PublicProfile, PublicProfilePrivacy, IadDetails } from "../../types";

const GET_ME_CACHE_TTL_MS = 60000;
const GET_ME_STALE_FALLBACK_MS = 5 * 60 * 1000;
const GET_ME_SNAPSHOT_STORAGE_KEY = "studycod.userSnapshot";

type CachedUser = {
  session: "cookie";
  fetchedAt: number;
  user: User;
};

type GetMeOptions = {
  force?: boolean;
  cacheTtlMs?: number;
  suppressAuthRedirect?: boolean;
};

let cachedGetMeUser: CachedUser | null = null;
let inFlightGetMeRequest: Promise<User> | null = null;
let inFlightGetMeToken: string | null = null;

const currentSession = (): "cookie" => "cookie";

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const status = Reflect.get(response, "status");
  return typeof status === "number" ? status : null;
};

const canUseFreshCache = (entry: CachedUser | null, session: "cookie", ttlMs: number): entry is CachedUser => {
  if (!entry) return false;
  if (entry.session !== session) return false;
  return Date.now() - entry.fetchedAt <= ttlMs;
};

const isTransientGetMeFailure = (status: number | null): boolean => {
  return status === null || status === 429 || status >= 500;
};

const persistUserSnapshot = (entry: CachedUser): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GET_ME_SNAPSHOT_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
};

const readUserSnapshot = (): CachedUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GET_ME_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Do not accept snapshots written by the legacy token-based client. They
    // may contain a bearer credential even if the snapshot itself is stale.
    if (typeof Reflect.get(parsed, "token") === "string") {
      clearUserSnapshot();
      return null;
    }
    const session = Reflect.get(parsed, "session");
    const fetchedAt = Number(Reflect.get(parsed, "fetchedAt"));
    const user = Reflect.get(parsed, "user");
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
    if (!user || typeof user !== "object") return null;

    return {
      session: session === "cookie" ? "cookie" : "cookie",
      fetchedAt,
      user: user as User,
    };
  } catch {
    return null;
  }
};

const clearUserSnapshot = (): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GET_ME_SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

const rememberUser = (user: User): User => {
  const next: CachedUser = {
    session: currentSession(),
    fetchedAt: Date.now(),
    user,
  };
  cachedGetMeUser = next;
  persistUserSnapshot(next);
  return user;
};

const getStaleFallbackUser = (session: "cookie"): User | null => {
  const now = Date.now();

  if (cachedGetMeUser && cachedGetMeUser.session === session && now - cachedGetMeUser.fetchedAt <= GET_ME_STALE_FALLBACK_MS) {
    return cachedGetMeUser.user;
  }

  const snapshot = readUserSnapshot();
  if (snapshot && snapshot.session === session && now - snapshot.fetchedAt <= GET_ME_STALE_FALLBACK_MS) {
    cachedGetMeUser = snapshot;
    return snapshot.user;
  }

  return null;
};

export function clearGetMeCache(options?: { clearSnapshot?: boolean }): void {
  cachedGetMeUser = null;
  inFlightGetMeRequest = null;
  inFlightGetMeToken = null;
  if (options?.clearSnapshot) {
    clearUserSnapshot();
  }
}

export function primeGetMeCache(user: User): void {
  rememberUser(user);
}

/** Returns only the in-memory cookie session, never a credential from storage. */
export function getCachedMeUser(): User | null {
  return cachedGetMeUser?.user ?? null;
}

export async function getMe(options?: GetMeOptions): Promise<User> {
  const force = options?.force === true;
  const cacheTtlMs = Number.isFinite(Number(options?.cacheTtlMs))
    ? Math.max(0, Number(options?.cacheTtlMs))
    : GET_ME_CACHE_TTL_MS;
  const session = currentSession();

  if (!force && canUseFreshCache(cachedGetMeUser, session, cacheTtlMs)) {
    return cachedGetMeUser.user;
  }

  if (!force && !cachedGetMeUser) {
    const snapshot = readUserSnapshot();
    if (snapshot) {
      cachedGetMeUser = snapshot;
      if (canUseFreshCache(snapshot, session, cacheTtlMs)) {
        return snapshot.user;
      }
    }
  }

  if (inFlightGetMeRequest && inFlightGetMeToken === session) {
    return inFlightGetMeRequest;
  }

  const request = api.get("/profile/me", options?.suppressAuthRedirect ? { headers: { "X-Skip-Auth-Redirect": "1" } } : undefined)
    .then((res) => rememberUser(res.data as User))
    .catch((error: unknown) => {
      const status = getErrorStatus(error);

      if (status === 401 || status === 403) {
        clearGetMeCache({ clearSnapshot: true });
        throw error;
      }

      if (!force && isTransientGetMeFailure(status)) {
        const fallback = getStaleFallbackUser(session);
        if (fallback) return fallback;
      }

      throw error;
    })
    .finally(() => {
      if (inFlightGetMeRequest === request) {
        inFlightGetMeRequest = null;
        inFlightGetMeToken = null;
      }
    });

  inFlightGetMeRequest = request;
  inFlightGetMeToken = session;

  return request;
}

export async function updateProfile(data: {
  avatarUrl?: string | null;
  avatarData?: string | null;
  contestHandles?: {
    codeforces?: string | null;
    atcoder?: string | null;
    leetcode?: string | null;
    codechef?: string | null;
  };
  publicProfilePrivacy?: PublicProfilePrivacy;
}): Promise<User> {
  const res = await api.put("/profile/me", data);
  return rememberUser(res.data as User);
}

export async function completePlacement(data: {
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  score?: number | null;
  course?: CourseLanguage;
  lang?: CourseLanguage;
  masteredUntilTopicIndex?: number | null;
}): Promise<User> {
  const res = await api.put("/profile/placement", data);
  return rememberUser(res.data as User);
}

export type PlacementCodingChallenge = {
  id: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  taskId: string;
  titleUk: string;
  titleEn: string;
  promptUk: string;
  promptEn: string;
  starterCode: string;
  language: CourseLanguage;
  sampleInput: string;
  sampleOutput: string;
};

export async function getPlacementCodingChallenge(params: {
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  course?: CourseLanguage;
  lang?: CourseLanguage;
}): Promise<PlacementCodingChallenge> {
  const res = await api.get("/profile/placement/coding-challenge", {
    params
  });
  return res.data as PlacementCodingChallenge;
}

export type PlacementCodingSubmitResult = {
  passed: boolean;
  passedCount: number;
  total: number;
  caseIndex?: number;
  expected?: string;
  actual?: string;
  stderr?: string | null;
  stdout?: string | null;
};

export type PlacementAssessmentTrack = "INTERMEDIATE" | "ADVANCED" | "UNDECIDED";

export type PlacementAssessmentPack = {
  track: PlacementAssessmentTrack;
  language: CourseLanguage;
  quizQuestions: Array<{
    id: string;
    promptUk: string;
    promptEn: string;
    optionsUk: string[];
    optionsEn: string[];
  }>;
  tasks: Array<{
    id: string;
    titleUk: string;
    titleEn: string;
    promptUk: string;
    promptEn: string;
    starterCode: string;
    language: CourseLanguage;
    sampleInput: string;
    sampleOutput: string;
  }>;
};

export type PlacementAssessmentSubmitResult = {
  user: User;
  summary: {
    track: PlacementAssessmentTrack;
    finalLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    quizCorrect: number;
    quizTotal: number;
    quizPct: number;
    practicalPassed: number;
    practicalTotal: number;
    practicalPct: number;
    overallPct: number;
  };
  quizReports: Array<{
    questionId: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
  }>;
  taskReports: Array<{
    taskId: string;
    passed: boolean;
    passedTests: number;
    totalTests: number;
    caseIndex?: number;
    stderr?: string | null;
    expected?: string;
    actual?: string;
  }>;
};

export async function submitPlacementCoding(data: {
  code: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  challengeId: string;
  course?: CourseLanguage;
  lang?: CourseLanguage;
}): Promise<PlacementCodingSubmitResult> {
  const res = await api.post("/profile/placement/coding-submit", data);
  return res.data as PlacementCodingSubmitResult;
}

export async function getPlacementAssessmentPack(params: {
  track: PlacementAssessmentTrack;
  course?: CourseLanguage;
  lang?: CourseLanguage;
}): Promise<PlacementAssessmentPack> {
  const res = await api.get("/profile/placement/assessment-pack", { params });
  return res.data as PlacementAssessmentPack;
}

export async function submitPlacementAssessment(data: {
  track: PlacementAssessmentTrack;
  course?: CourseLanguage;
  lang?: CourseLanguage;
  quizAnswers: Array<{ questionId: string; selectedIndex: number }>;
  taskSolutions: Array<{ taskId: string; code: string }>;
}): Promise<PlacementAssessmentSubmitResult> {
  const res = await api.post("/profile/placement/assessment-submit", data);
  return res.data as PlacementAssessmentSubmitResult;
}

export async function getEmailSubscription(): Promise<{ enabled: boolean; email: string | null }> {
  const res = await api.get("/profile/email-subscription");
  return res.data as { enabled: boolean; email: string | null };
}

export async function updateEmailSubscription(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await api.put("/profile/email-subscription", { enabled });
  return res.data as { enabled: boolean };
}

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const safe = encodeURIComponent(String(username ?? "").trim());
  const res = await api.get(`/profile/public/${safe}`);
  const profile = res.data as PublicProfile;
  return {
    ...profile,
    recentSolved: (profile.recentSolved ?? []).map((item) => ({
      ...item,
      createdAt: item.lastCheckedAt ?? "",
    })),
  };
}

export async function getIadDetails(): Promise<IadDetails> {
  const res = await api.get("/profile/iad");
  return res.data as IadDetails;
}

export const getDifusDetails = getIadDetails;
