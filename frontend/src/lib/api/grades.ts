import { api } from "./client";
import type { Grade } from "../../types";

export async function listGrades(courseId?: number | null): Promise<Grade[]> {
  const res = await api.get("/grades", courseId ? { params: { courseId } } : undefined);
  const data: unknown = res.data;
  if (Array.isArray(data)) return data as Grade[];
  if (data && typeof data === "object" && Array.isArray((data as { grades?: unknown }).grades)) {
    return (data as { grades: Grade[] }).grades;
  }
  return [];
}
