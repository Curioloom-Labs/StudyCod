import { createSecretKey } from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "../config";

// A secret KeyObject avoids repeatedly attempting to parse an HMAC secret as a
// public key. The rate limiter and auth middleware may validate the same token.
const key = createSecretKey(Buffer.from(JWT_SECRET, "utf8"));
const verified = new WeakMap<object, { token: string; payload: JwtPayload }>();

export function verifyAuthJwt(request: object, token: string): JwtPayload {
  const cached = verified.get(request);
  const now = Math.floor(Date.now() / 1000);
  if (cached?.token === token && (cached.payload.exp == null || now < cached.payload.exp)
    && (cached.payload.nbf == null || now >= cached.payload.nbf)) return cached.payload;
  const payload = jwt.verify(token, key, { algorithms: ["HS256"] });
  if (typeof payload !== "object" || payload === null) throw new Error("Invalid authentication claims");
  verified.set(request, { token, payload });
  return payload;
}
