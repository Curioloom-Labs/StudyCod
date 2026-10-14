import crypto from "crypto";
import { SESSION_SECRET, JWT_SECRET } from "../../config";

const root = () => SESSION_SECRET || JWT_SECRET;
const key = (purpose: string, secret: string) => crypto.createHmac("sha256", secret).update(`studycod:edu-credentials:v1:${purpose}`).digest();
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, item]) => [name, canonical(item)])) : value;

export function credentialRequestHash(value: unknown, secret = root()): string {
  return crypto.createHmac("sha256", key("request", secret)).update(JSON.stringify(canonical(value))).digest("hex");
}
export function encryptCredentialResponse(value: unknown, context: string, secret = root()): string {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key("response", secret), iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}
export function decryptCredentialResponse<T>(envelope: string, context: string, secret = root()): T {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("INVALID_CREDENTIAL_ENVELOPE");
  const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("INVALID_CREDENTIAL_ENVELOPE");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key("response", secret), iv);
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8")) as T;
}
