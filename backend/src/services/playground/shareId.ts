/**
 * Share-id generation/validation for playground snippets.
 *
 * URL-safe, unguessable-ish ids for shareable links. Pure validation; the
 * generator uses crypto for unpredictability.
 */
import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 12;
const VALID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export function generateShareId(length: number = ID_LENGTH): string {
  const n = Math.max(6, Math.min(32, Math.floor(length)));
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isValidShareId(id: unknown): id is string {
  return typeof id === "string" && VALID_RE.test(id);
}
