import { api } from "./client";
import type { Grade } from "../../types";

type JwtPayload = {
  type?: string;
  studentId?: number;
};

function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  try {
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function isStudentToken(): boolean {
  if (typeof window === "undefined") return false;
  const payload = decodeJwtPayload(localStorage.getItem("token"));
  return payload?.type === "STUDENT" || typeof payload?.studentId === "number";
}

export async function listGrades(): Promise<Grade[]> {
  if (isStudentToken()) {
    return [];
  }
  const res = await api.get("/grades");
  const data: unknown = res.data;
  if (Array.isArray(data)) return data as Grade[];
  if (data && typeof data === "object" && Array.isArray((data as { grades?: unknown }).grades)) {
    return (data as { grades: Grade[] }).grades;
  }
  return [];
}