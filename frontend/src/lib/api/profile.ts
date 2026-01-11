import { api } from "./client";
import type { User, CourseLanguage } from "../../types";
export async function getMe(): Promise<User> {
  const res = await api.get("/profile/me");
  return res.data as User;
}
export async function updateProfile(data: {
  course?: CourseLanguage;
  avatarUrl?: string | null;
  avatarData?: string | null;
}): Promise<User> {
  const res = await api.put("/profile/me", data);
  return res.data as User;
}