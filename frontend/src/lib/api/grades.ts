import { api } from "./client";
import type { Grade } from "../../types";

export async function listGrades(): Promise<Grade[]> {
  const res = await api.get("/grades");
  const data: unknown = res.data;
  if (Array.isArray(data)) return data as Grade[];
  if (data && typeof data === "object" && Array.isArray((data as { grades?: unknown }).grades)) {
    return (data as { grades: Grade[] }).grades;
  }
  return [];
}
