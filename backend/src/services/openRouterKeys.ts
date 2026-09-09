import * as crypto from "crypto";
import { env } from "../env";
export function pickOpenRouterKey(): string | null {
  const primary = (env.OPENROUTER_API_KEY || "").trim();
  const backups = (env.OPENROUTER_BACKUP_API_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);
  const candidates = [primary, ...backups].filter(Boolean);
  if (!candidates.length) return null;
  const idx = crypto.randomInt(0, candidates.length);
  return candidates[idx];
}
