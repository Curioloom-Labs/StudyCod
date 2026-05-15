import { env } from "../env";

export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}
export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}
export function getGoogleCallbackUrl(): string {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL.trim();
  }

  // In development (localhost), we MUST use the frontend port (typically 5173) for the callback URL
  // so the browser sends the session cookie that was set during the initiator request.
  // The Vite proxy will then forward the callback request to the backend.
  const frontendUrl = String(env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  const backendUrl = String(env.BACKEND_PUBLIC_URL || "").trim().replace(/\/+$/, "");

  const isLocalhost = frontendUrl.includes("localhost") || frontendUrl.includes("127.0.0.1");
  const baseUrl = isLocalhost ? frontendUrl : backendUrl;

  return `${baseUrl}/api/auth/google/callback`;
}
export const isGoogleOAuthEnabled = () => {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const hasClientId = clientId.length > 0;
  const hasClientSecret = clientSecret.length > 0;
  return hasClientId && hasClientSecret;
};
