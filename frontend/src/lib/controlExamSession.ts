import { currentPrincipalStorageId } from "./storageScope";

export type ControlExamSession = {
  controlWorkId: number;
  active: true;
  activatedAt: string;
};

const STORAGE_KEY = "studycod.edu.controlExamSession.v1";
const EVENT_NAME = "studycod:control-exam-session";

function scopedStorageKey(): string {
  return `${STORAGE_KEY}:${currentPrincipalStorageId()}`;
}

function dispatchSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function isValidSession(value: unknown): value is ControlExamSession {
  if (!value || typeof value !== "object") return false;
  const controlWorkId = Reflect.get(value, "controlWorkId");
  const active = Reflect.get(value, "active");
  const activatedAt = Reflect.get(value, "activatedAt");
  return (
    typeof controlWorkId === "number" &&
    Number.isFinite(controlWorkId) &&
    controlWorkId > 0 &&
    active === true &&
    typeof activatedAt === "string" &&
    activatedAt.length > 0
  );
}

export function getControlExamSession(): ControlExamSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(scopedStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function activateControlExamSession(controlWorkId: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(controlWorkId) || controlWorkId <= 0) return;
  const payload: ControlExamSession = {
    controlWorkId: Math.floor(controlWorkId),
    active: true,
    activatedAt: new Date().toISOString()
  };
  window.sessionStorage.setItem(scopedStorageKey(), JSON.stringify(payload));
  dispatchSessionChanged();
}

export function clearControlExamSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(scopedStorageKey());
  // Remove the pre-isolation key left by older builds.
  window.sessionStorage.removeItem(STORAGE_KEY);
  dispatchSessionChanged();
}

export function isControlExamSessionActive(): boolean {
  return !!getControlExamSession();
}

export function subscribeControlExamSession(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(STORAGE_KEY)) return;
    listener();
  };
  const onCustom = () => listener();

  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}

export function isPathAllowedInControlExam(pathname: string, controlWorkId: number): boolean {
  if (!pathname) return false;
  if (/^\/edu\/tasks\/\d+\/?$/i.test(pathname)) return true;

  const lessonMatch = pathname.match(/^\/edu\/lessons\/(\d+)\/?$/i);
  if (!lessonMatch) return false;

  const lessonId = Number(lessonMatch[1]);
  return Number.isFinite(lessonId) && lessonId === controlWorkId;
}
