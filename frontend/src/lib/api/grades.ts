import { api } from "./client";
import type { Grade } from "../../types";
export async function listGrades(): Promise<Grade[]> {
  const res = await api.get("/grades");
  return res.data as Grade[];
}