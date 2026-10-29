import { api } from "./client";
import type { User } from "../../types";
import { clearGetMeCache } from "./profile";
import { setActiveEduStudentId } from "../eduContext";
export interface RegisterResponse {
  message: string;
  requiresEmailVerification?: boolean;
  user?: User;
}
export async function register(username: string, email: string, password: string, firstName: string, lastName: string, birthDay: number, birthMonth: number, turnstileToken?: string): Promise<RegisterResponse> {
  const res = await api.post("/auth/register", {
    username,
    email,
    password,
    ...(turnstileToken ? { turnstileToken } : {}),
    firstName,
    lastName,
    birthDay,
    birthMonth
  });
  return res.data as RegisterResponse;
}
export async function login(username: string, password: string, turnstileToken?: string): Promise<User> {
  const res = await api.post("/auth/login", {
    username,
    password,
    ...(turnstileToken ? { turnstileToken } : {})
  });
  // A new account cookie must not inherit another account's selected class or profile.
  setActiveEduStudentId(null);
  clearGetMeCache({ clearSnapshot: true });
  return res.data.user as User;
}

export async function contestLogin(username: string, password: string, contestId?: number, turnstileToken?: string): Promise<User> {
  const res = await api.post("/auth/contest-login", {
    username,
    password,
    ...(contestId != null ? { contestId } : {}),
    ...(turnstileToken ? { turnstileToken } : {})
  });
  return res.data.user as User;
}

export async function exchangeGoogleCode(code: string, flow?: "success" | "complete"): Promise<{ setupToken?: string; flow: "success" | "complete" }> {
  const res = await api.post("/auth/google/exchange-code", {
    code,
    ...(flow ? { flow } : {})
  });
  return {
    ...(res.data.setupToken ? { setupToken: String(res.data.setupToken) } : {}),
    flow: res.data.flow === "complete" ? "complete" : "success"
  };
}

export async function exchangeGoogleCookie(flow?: "success" | "complete"): Promise<{ setupToken?: string; flow: "success" | "complete" }> {
  const res = await api.post("/auth/google/exchange-cookie", {
    ...(flow ? { flow } : {})
  });
  return {
    ...(res.data.setupToken ? { setupToken: String(res.data.setupToken) } : {}),
    flow: res.data.flow === "complete" ? "complete" : "success"
  };
}

export async function prepareGoogleLinkSession(): Promise<void> {
  await api.post("/auth/google/link-session");
}

export async function verifyEmail(token: string): Promise<{
  user: User;
}> {
  const res = await api.get("/auth/verify-email", {
    params: {
      token
    }
  });
  return {
    user: res.data.user
  };
}
export async function resendVerificationEmail(email: string): Promise<void> {
  await api.post("/auth/resend-verification", {
    email
  });
}
export async function requestPasswordReset(email: string, next?: string): Promise<void> {
  await api.post("/auth/forgot-password", {
    email, ...(next ? { next } : {})
  });
}
export async function resetPassword(token: string, newPassword: string): Promise<{ userMode?: "EDUCATIONAL" }> {
  const response = await api.post("/auth/reset-password", {
    token,
    newPassword
  });
  return response.data;
}
export async function linkGoogleAccount(token: string): Promise<User> {
  const res = await api.post("/auth/google/link", {
    token
  });
  return res.data.user as User;
}
