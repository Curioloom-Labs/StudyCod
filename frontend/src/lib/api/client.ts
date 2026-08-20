import axios, { AxiosError, AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getRetryDelayMs, sleep, getRetryCount, setRetryCount } from "./retry";
import { getActiveEduStudentId } from "../eduContext";
type MaintenancePayload = {
  maintenance: true;
  title: string;
  message: string;
  until: string | null;
};

type MaintenanceErrorData = {
  maintenance?: boolean;
  title?: unknown;
  message?: unknown;
  until?: unknown;
};

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffFactor: 2,
  shouldRetry: (error: AxiosError, retryCount: number) => {
    if (retryCount <= 0) return false;

    // Retrying a POST/PATCH can duplicate side effects (messages, submissions,
    // payments). Only automatically retry idempotent reads; callers that have
    // an explicit idempotency key can retry their mutation themselves.
    const method = String(error.config?.method || "get").toLowerCase();
    if (!["get", "head", "options"].includes(method)) return false;

    // Don't retry client errors (4xx). Rate limits are intentional back-pressure;
    // retrying them here amplifies request bursts during UI toggles.
    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    // Retry server errors (5xx)
    if (error.response?.status && error.response.status >= 500) {
      return true;
    }

    // Retry on network error or timeout
    if (error.code === "ECONNABORTED" || error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.message?.includes("timeout")) {
      return true;
    }

    return false;
  }
};

function emitMaintenance(payload: MaintenancePayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("studycod.maintenance", JSON.stringify(payload));
  } catch {}
  window.dispatchEvent(new CustomEvent("studycod:maintenance", {
    detail: payload
  }));
}

type GeoBlockPayload = {
  geoBlocked: true;
  country: string | null;
};

function emitGeoBlock(payload: GeoBlockPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("studycod.geoblock", JSON.stringify(payload));
  } catch {}
  window.dispatchEvent(new CustomEvent("studycod:geoblock", {
    detail: payload
  }));
}
function joinApiBase(url: string): string {
  let base = String(url || "").trim();
  // Remove trailing slashes
  base = base.replace(/\/+$/, "");
  // If caller provided a value that already ends with '/api', strip it to avoid '/api/api' when appending.
  base = base.replace(/\/api\/?$/i, "");
  return `${base}/api`;
}
function getDefaultBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

function buildLoginRedirectTarget(): string {
  if (typeof window === "undefined") return "/?auth=login";

  const isContestArea = window.location.pathname.startsWith("/contest");
  if (isContestArea) return "/contest";

  // Never use an auth screen as its own post-login target. A 401 while the
  // login/register page is booting must stay on a clean auth URL; otherwise
  // every interceptor pass nests the previous `next` value again.
  if (window.location.pathname === "/" && (() => {
    const current = new URLSearchParams(window.location.search);
    return current.get("auth") === "login" || current.get("auth") === "register";
  })()) return "/?auth=login";

  const nextRaw = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const nextParam = next === "/" ? "" : `&next=${encodeURIComponent(next)}`;
  return `/?auth=login${nextParam}`;
}

function isSameBrowserLocation(target: string): boolean {
  if (typeof window === "undefined") return false;
  const current = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  return target === current;
}

function shouldSkipAuthRedirect(config: InternalAxiosRequestConfig | undefined): boolean {
  const headers = config?.headers;
  if (!headers) return false;
  if (typeof headers.get === "function") {
    return String(headers.get("X-Skip-Auth-Redirect") ?? "") === "1";
  }
  return String((headers as Record<string, unknown>)["X-Skip-Auth-Redirect"] ?? "") === "1";
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const part = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("XSRF-TOKEN="));
  return part ? decodeURIComponent(part.slice("XSRF-TOKEN=".length)) : null;
}

let csrfBootstrap: Promise<void> | null = null;

export const api = axios.create({
  baseURL: joinApiBase(import.meta.env.VITE_API_URL || getDefaultBaseUrl()),
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN"
});
// Authentication is cookie-only. Clear the pre-cookie legacy token once so an
// upgrade cannot leave a bearer credential exposed to any page script.
try {
  if (typeof window !== "undefined") localStorage.removeItem("token");
} catch {
  // Ignore private-mode/storage errors.
}
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = String(config.method || "get").toLowerCase();
  if (typeof window !== "undefined" && !["get", "head", "options"].includes(method) && !readCsrfCookie()) {
    csrfBootstrap ??= axios.get(`${config.baseURL || ""}/csrf-token`, { withCredentials: true }).then(() => undefined).finally(() => {
      csrfBootstrap = null;
    });
    await csrfBootstrap;
  }

  const uiLanguage = localStorage.getItem("studycod_language") || "en";
  if (typeof document !== "undefined") {
    const csrf = readCsrfCookie();
    if (csrf) {
      if (config.headers && typeof config.headers.set === "function") {
        config.headers.set("X-XSRF-TOKEN", csrf);
      } else {
        config.headers = AxiosHeaders.from({
          ...(config.headers || {}),
          "X-XSRF-TOKEN": csrf
        });
      }
    }
  }
  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("X-UI-Language", uiLanguage);
    config.headers.set("Accept-Language", uiLanguage);
    const studentId = getActiveEduStudentId();
    if (studentId != null) config.headers.set("X-StudyCod-Edu-Student", String(studentId));
  } else {
    config.headers = AxiosHeaders.from({
      ...(config.headers || {}),
      "X-UI-Language": uiLanguage,
      "Accept-Language": uiLanguage,
      ...(getActiveEduStudentId() != null ? { "X-StudyCod-Edu-Student": String(getActiveEduStudentId()) } : {})
    });
  }
  return config;
}, (error: AxiosError) => {
  return Promise.reject(error);
});
api.interceptors.response.use((response: AxiosResponse) => {
  if (typeof response.data === "string") {
    const head = response.data.slice(0, 200).toLowerCase();
    if (head.includes("<!doctype html") || head.includes("<html")) {
      const url = (response.config?.url || "").toString();
      throw new Error(`API returned HTML instead of JSON for ${url}. Check Nginx routes for /api/*.`);
    }
  }
  return response;
}, async (error: AxiosError<MaintenanceErrorData>) => {
  const requestConfig = error.config as InternalAxiosRequestConfig | undefined;
  if (error.response?.status === 401 && !shouldSkipAuthRedirect(requestConfig)) {
    if (typeof window !== "undefined") {
      const target = buildLoginRedirectTarget();
      // An unauthenticated auth page legitimately receives 401 from
      // /profile/me while it is booting. Never reload the exact same URL;
      // doing so creates a tight navigation loop instead of rendering login.
      if (!isSameBrowserLocation(target)) {
        window.location.replace(target);
      }
    }
  }
  if (error.response?.status === 503) {
    const data = error.response?.data;
    if (data && data.maintenance === true) {
      emitMaintenance({
        maintenance: true,
        title: String(data.title ?? ""),
        message: String(data.message ?? ""),
        until: data.until ? String(data.until) : null
      });
    }
  }
  if (error.response?.status === 451) {
    const data = error.response?.data as { geoBlocked?: boolean; country?: unknown } | undefined;
    if (data && data.geoBlocked === true) {
      emitGeoBlock({
        geoBlocked: true,
        country: typeof data.country === "string" ? data.country : null
      });
    }
  }

  // Implement retry logic for transient failures
  const config = error.config as InternalAxiosRequestConfig;
  if (!config) {
    return Promise.reject(error);
  }

  // A long-lived browser tab can retain an expired XSRF cookie after a
  // session switch or backend restart. Refresh it once and replay the failed
  // mutation instead of surfacing a misleading login failure to the user.
  const csrfRetryConfig = config as InternalAxiosRequestConfig & { _csrfRetried?: boolean };
  const csrfError = error.response?.status === 403
    && String((error.response?.data as { error?: unknown } | undefined)?.error ?? "") === "CSRF_TOKEN_INVALID";
  if (csrfError && typeof window !== "undefined" && !csrfRetryConfig._csrfRetried) {
    csrfRetryConfig._csrfRetried = true;
    csrfBootstrap ??= axios.get(`${config.baseURL || ""}/csrf-token`, { withCredentials: true }).then(() => undefined).finally(() => {
      csrfBootstrap = null;
    });
    await csrfBootstrap;
    return api.request(config);
  }

  const retryCount = getRetryCount(config);
  const shouldRetry = RETRY_CONFIG.shouldRetry(error, RETRY_CONFIG.maxRetries - retryCount);

  if (shouldRetry && retryCount < RETRY_CONFIG.maxRetries) {
    const delayMs = getRetryDelayMs(retryCount + 1, RETRY_CONFIG);
    setRetryCount(config, retryCount + 1);

    return sleep(delayMs).then(() => {
      return api.request(config);
    });
  }

  return Promise.reject(error);
});
