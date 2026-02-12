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
  return hasClientId && hasClientSecret;
};