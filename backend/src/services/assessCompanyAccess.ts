import { AppDataSource } from "../data-source";
import { isAssessCompanyRole, type AssessCompanyRole } from "./assessAccessPolicy";

/** Returns only an active, recognized role. Unknown or pending rows fail closed. */
export async function activeAssessCompanyRole(companyId: string, userId: number): Promise<AssessCompanyRole | null> {
  if (typeof companyId !== "string" || !companyId.trim() || !Number.isSafeInteger(userId) || userId <= 0) return null;
  const rows = await AppDataSource.query(
    "SELECT role FROM growth_company_members WHERE company_id=? AND user_id=? AND status='ACTIVE' LIMIT 1",
    [companyId, userId],
  ) as Array<{ role?: unknown }>;
  return isAssessCompanyRole(rows[0]?.role) ? rows[0].role : null;
}
