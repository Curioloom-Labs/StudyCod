import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
type MaintenancePayload = {
  maintenance: true;
  title: string;
  message: string;
  until: string | null;
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
  const base = (url || "").replace(/\/+$/, "");
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
  if (token) {
    const headers = (config.headers ?? {}) as any;
    headers.Authorization = `Bearer ${token}`;
    config.headers = headers;
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
}, (error: AxiosError) => {
  if ((error as any).response?.status === 401) {
    localStorage.removeItem("token");
  }
  if ((error as any).response?.status === 503) {
    const data = (error as any).response?.data as any;
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