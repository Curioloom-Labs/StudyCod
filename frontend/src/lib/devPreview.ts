import type { User } from "../types";

export function isDevPreviewActive(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return import.meta.env.DEV === true && new URLSearchParams(search).get("preview") === "true";
}

export function withDevPreview(target: string, currentSearch = typeof window === "undefined" ? "" : window.location.search): string {
  if (!import.meta.env.DEV) return target;
  const current = new URLSearchParams(currentSearch);
  if (current.get("preview") !== "true") return target;
  const hashAt = target.indexOf("#");
  const hash = hashAt >= 0 ? target.slice(hashAt) : "";
  const withoutHash = hashAt >= 0 ? target.slice(0, hashAt) : target;
  const queryAt = withoutHash.indexOf("?");
  const pathname = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const params = new URLSearchParams(queryAt >= 0 ? withoutHash.slice(queryAt + 1) : "");
  params.set("preview", "true");
  const persona = current.get("persona");
  if (persona) params.set("persona", persona);
  return `${pathname}?${params.toString()}${hash}`;
}

export const DEV_PREVIEW_USER: User = {
  id: -101,
  username: "Oksana",
  firstName: "Оксана",
  lastName: "Мельник",
  activeRuntime: "PYTHON",
  difus: 72,
  avatarUrl: null,
  userMode: "PERSONAL",
  role: "USER",
  placementDone: true,
  placementLevel: "INTERMEDIATE",
};

export function getDevPreviewUser(search = typeof window === "undefined" ? "" : window.location.search, fallbackPersona = "personal"): User {
  const persona = new URLSearchParams(search).get("persona") || fallbackPersona;
  if (persona === "admin") return { ...DEV_PREVIEW_USER, role: "SYSTEM_ADMIN", username: "admin-preview", firstName: "Admin" };
  if (persona === "teacher") return { ...DEV_PREVIEW_USER, id: -102, username: "teacher-preview", userMode: "EDUCATIONAL", role: "TEACHER", firstName: "Олена", lastName: "Коваль" };
  if (persona === "student") return { ...DEV_PREVIEW_USER, id: -103, username: "student-preview", userMode: "EDUCATIONAL", role: "TEACHER", studentId: 1, classId: 31, className: "10-Б · StudyCod", firstName: "Софія", lastName: "Мельник" };
  if (persona === "parent") return { ...DEV_PREVIEW_USER, id: -105, username: "parent-preview", userMode: "EDUCATIONAL", role: "USER", firstName: "Ірина", lastName: "Коваль" };
  if (persona === "contest") return { ...DEV_PREVIEW_USER, id: -104, username: "contest-preview", userMode: "CONTEST", firstName: "Учасник" };
  return DEV_PREVIEW_USER;
}
