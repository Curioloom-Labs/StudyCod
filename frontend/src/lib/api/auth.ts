import { api } from "./client";
import type { User } from "../../types";
export interface RegisterResponse {
  message: string;
  requiresEmailVerification?: boolean;
  token?: string;
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
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data as RegisterResponse;
}
export async function login(username: string, password: string, turnstileToken?: string): Promise<User> {
  const res = await api.post("/auth/login", {
    username,
    password,
    ...(turnstileToken ? { turnstileToken } : {})
  });
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
  }
  return res.data.user as User;
}

export async function contestLogin(username: string, password: string, turnstileToken?: string): Promise<User> {
  const res = await api.post("/auth/contest-login", {
    username,
    password,
    ...(turnstileToken ? { turnstileToken } : {})
  });
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
  }
  return res.data.user as User;
}

export async function exchangeGoogleCode(code: string, flow?: "success" | "complete"): Promise<{ token: string; flow: "success" | "complete" }> {
  const res = await api.post("/auth/google/exchange-code", {
    code,
    ...(flow ? { flow } : {})
  });
  return {
    token: String(res.data.token || ""),
    flow: res.data.flow === "complete" ? "complete" : "success"
  };
}

export async function exchangeGoogleCookie(flow?: "success" | "complete"): Promise<{ token: string; flow: "success" | "complete" }> {
  const res = await api.post("/auth/google/exchange-cookie", {
    ...(flow ? { flow } : {})
  });
  return {
    token: String(res.data.token || ""),
    flow: res.data.flow === "complete" ? "complete" : "success"
  };
}

export async function prepareGoogleLinkSession(): Promise<void> {
  await api.post("/auth/google/link-session");
}

export async function verifyEmail(token: string): Promise<{
  token: string;
  user: User;
}> {
  const res = await api.get("/auth/verify-email", {
    params: {
      token
    }
  });
  localStorage.setItem("token", res.data.token);
  return {
    token: res.data.token,
    user: res.data.user
  };
}
export async function resendVerificationEmail(email: string): Promise<void> {
  await api.post("/auth/resend-verification", {
    email
  });
}
export async function requestPasswordReset(email: string): Promise<void> {
  await api.post("/auth/forgot-password", {
    email
  });
}
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", {
    token,
    newPassword
  });
}
export async function linkGoogleAccount(token: string): Promise<User> {
  const res = await api.post("/auth/google/link", {
    token
  });
  return res.data.user as User;
}
