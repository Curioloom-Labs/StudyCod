import type { Response } from "express";
import { AppDataSource } from "../data-source";
import {
  portfolioSharingAgeStatus,
  type PortfolioBirthDateParts,
  type PortfolioSharingAgeStatus,
} from "../utils/portfolioAge";

export function portfolioOwnerAgeStatus(row?: unknown): PortfolioSharingAgeStatus {
  if (typeof row !== "object" || row === null) return "UNKNOWN";
  const record = row as Record<string, unknown>;
  const parts: PortfolioBirthDateParts = {
    birthDay: record.birthDay,
    birthMonth: record.birthMonth,
    birthYear: record.birthYear,
  };
  return portfolioSharingAgeStatus(parts);
}

export function isAdultPortfolioOwner(row?: unknown): boolean {
  return portfolioOwnerAgeStatus(row) === "ADULT";
}

export async function canEnablePublicPortfolioSharing(ownerId: number): Promise<boolean> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return false;
  const rows = await AppDataSource.query(
    "SELECT birth_day AS birthDay,birth_month AS birthMonth,birth_year AS birthYear FROM users WHERE id=? AND user_mode='PERSONAL' LIMIT 1",
    [ownerId],
  ) as Array<PortfolioBirthDateParts>;
  return isAdultPortfolioOwner(rows[0]);
}

export async function requireAdultPortfolioSharing(ownerId: number, response: Response): Promise<boolean> {
  if (await canEnablePublicPortfolioSharing(ownerId)) return true;
  response.status(403).json({ code: "PUBLIC_SHARING_REQUIRES_ADULT_AGE", message: "PUBLIC_SHARING_REQUIRES_ADULT_AGE" });
  return false;
}
