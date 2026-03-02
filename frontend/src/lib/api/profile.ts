import { api } from "./client";
import type { User, CourseLanguage, PublicProfile, PublicProfilePrivacy } from "../../types";
export async function getMe(): Promise<User> {
  const res = await api.get("/profile/me");
  return res.data as User;
}
export async function updateProfile(data: {
  course?: CourseLanguage;
  avatarUrl?: string | null;
  avatarData?: string | null;
  contestHandles?: {
    codeforces?: string | null;
    atcoder?: string | null;
    leetcode?: string | null;
    codechef?: string | null;
  };
  publicProfilePrivacy?: PublicProfilePrivacy;
}): Promise<User> {
  const res = await api.put("/profile/me", data);
  return res.data as User;
}

export async function completePlacement(data: {
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  score?: number | null;
  course?: CourseLanguage;
  lang?: CourseLanguage;
  masteredUntilTopicIndex?: number | null;
}): Promise<User> {
  const res = await api.put("/profile/placement", data);
  return res.data as User;
}

export type PlacementCodingChallenge = {
  id: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  taskId: string;
  titleUk: string;
  titleEn: string;
  promptUk: string;
  promptEn: string;
  starterCode: string;
  language: CourseLanguage;
  sampleInput: string;
  sampleOutput: string;
};

export async function getPlacementCodingChallenge(params: {
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  course?: CourseLanguage;
  lang?: CourseLanguage;
}): Promise<PlacementCodingChallenge> {
  const res = await api.get("/profile/placement/coding-challenge", {
    params
  });
  return res.data as PlacementCodingChallenge;
}

export type PlacementCodingSubmitResult = {
  passed: boolean;
  passedCount: number;
  total: number;
  caseIndex?: number;
  expected?: string;
  actual?: string;
  stderr?: string | null;
  stdout?: string | null;
};

export async function submitPlacementCoding(data: {
  code: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  challengeId: string;
  course?: CourseLanguage;
  lang?: CourseLanguage;
}): Promise<PlacementCodingSubmitResult> {
  const res = await api.post("/profile/placement/coding-submit", data);
  return res.data as PlacementCodingSubmitResult;
}

export async function getEmailSubscription(): Promise<{ enabled: boolean; email: string | null }> {
  const res = await api.get("/profile/email-subscription");
  return res.data as { enabled: boolean; email: string | null };
}

export async function updateEmailSubscription(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await api.put("/profile/email-subscription", { enabled });
  return res.data as { enabled: boolean };
}

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const safe = encodeURIComponent(String(username ?? "").trim());
  const res = await api.get(`/profile/public/${safe}`);
  return res.data as PublicProfile;
}