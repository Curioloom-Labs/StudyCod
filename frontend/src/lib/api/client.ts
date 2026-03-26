import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
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
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
        "X-UI-Language": uiLanguage,
        "Accept-Language": uiLanguage
      };
    }
    return config;
  }

  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("X-UI-Language", uiLanguage);
    config.headers.set("Accept-Language", uiLanguage);
  } else {
    config.headers = {
      ...(config.headers || {}),
      "X-UI-Language": uiLanguage,
      "Accept-Language": uiLanguage
    };
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
      const isContestArea = window.location.pathname.startsWith("/contest");
      window.location.href = isContestArea ? "/contest" : "/auth";
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
  return Promise.reject(error);
});