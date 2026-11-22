import { createHash } from "crypto";
import type { Request, Response } from "express";
import { AppDataSource } from "../data-source";

export const assessApiKeyScopes = ["assessments:read", "assessments:write"] as const;
export type AssessApiKeyScope = typeof assessApiKeyScopes[number];
export type AssessApiKeyPrincipal = { keyId: string; companyId: string; createdBy: number; scopes: AssessApiKeyScope[] };

export async function authenticateAssessApiKey(req: Request, res: Response, requiredScope: AssessApiKeyScope): Promise<AssessApiKeyPrincipal | null> {
  const authorization = req.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("sc_assess_live_") || token.length > 160) {
    res.status(401).json({ error: "ASSESS_API_KEY_REQUIRED" });
    return null;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await AppDataSource.query(
    `SELECT id,company_id AS companyId,created_by AS createdBy,scopes_json AS scopesJson
     FROM growth_assess_api_keys WHERE token_hash=? AND revoked_at IS NULL LIMIT 1`,
    [tokenHash],
  ) as Array<{ id: string; companyId: string; createdBy: number; scopesJson: string }>;
  const row = rows[0];
  if (!row) {
    res.status(401).json({ error: "ASSESS_API_KEY_INVALID" });
    return null;
  }
  let scopes: unknown = [];
  try { scopes = JSON.parse(row.scopesJson); } catch { /* invalid scope storage denies access */ }
  if (!Array.isArray(scopes) || !scopes.includes(requiredScope)) {
    res.status(403).json({ error: "ASSESS_API_SCOPE_REQUIRED", requiredScope });
    return null;
  }
  await AppDataSource.query("UPDATE growth_assess_api_keys SET last_used_at=UTC_TIMESTAMP(3) WHERE id=? AND revoked_at IS NULL", [row.id]);
  return { keyId: row.id, companyId: row.companyId, createdBy: Number(row.createdBy), scopes: scopes as AssessApiKeyScope[] };
}
