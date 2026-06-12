import axios, { AxiosError, AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getRetryDelayMs, sleep, getRetryCount, setRetryCount } from "./retry";
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

  const nextRaw = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const nextParam = next === "/" ? "" : `&next=${encodeURIComponent(next)}`;
  return `/?auth=login${nextParam}`;
}

export const api = axios.create({
  baseURL: joinApiBase(import.meta.env.VITE_API_URL || getDefaultBaseUrl()),
  withCredentials: true
});
const savedToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
if (savedToken) {
  api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
}
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("token");
  const uiLanguage = localStorage.getItem("studycod_language") || "en";
  if (token) {
    if (config.headers && typeof config.headers.set === "function") {
      config.headers.set("Authorization", `Bearer ${token}`);
      config.headers.set("X-UI-Language", uiLanguage);
      config.headers.set("Accept-Language", uiLanguage);
    } else {
      config.headers = AxiosHeaders.from({
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
        "X-UI-Language": uiLanguage,
        "Accept-Language": uiLanguage
      });
    }
    return config;
  }

  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("X-UI-Language", uiLanguage);
    config.headers.set("Accept-Language", uiLanguage);
  } else {
    config.headers = AxiosHeaders.from({
      ...(config.headers || {}),
      "X-UI-Language": uiLanguage,
      "Accept-Language": uiLanguage
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
}, (error: AxiosError<MaintenanceErrorData>) => {
  if (error.response?.status === 401) {
    localStorage.removeItem("token");
    if (typeof window !== "undefined") {
      window.location.href = buildLoginRedirectTarget();
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

  // Implement retry logic for transient failures
  const config = error.config as InternalAxiosRequestConfig;
  if (!config) {
    return Promise.reject(error);
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
