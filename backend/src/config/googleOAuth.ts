export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}
export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}
export function getGoogleCallbackUrl(): string {
  return (process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback").trim();
}
export const isGoogleOAuthEnabled = () => {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const hasClientId = clientId.length > 0;
  const hasClientSecret = clientSecret.length > 0;
  if (process.env.NODE_ENV !== "production") {
    if (!hasClientId || !hasClientSecret) {
      console.warn("Google OAuth not configured");
      if (!hasClientId) {
        console.warn("GOOGLE_CLIENT_ID is missing or empty");
      }
      if (!hasClientSecret) {
        console.warn("GOOGLE_CLIENT_SECRET is missing or empty");
      }
    }
  }
  return hasClientId && hasClientSecret;
};