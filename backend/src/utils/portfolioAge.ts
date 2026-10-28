export type PortfolioBirthDateParts = {
  birthDay: unknown;
  birthMonth: unknown;
  birthYear: unknown;
};

export type PortfolioSharingAgeStatus = "UNKNOWN" | "UNDER_18" | "ADULT";

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function portfolioSharingAgeStatus(parts: PortfolioBirthDateParts, now = new Date()): PortfolioSharingAgeStatus {
  const day = Number(parts.birthDay);
  const month = Number(parts.birthMonth);
  const year = Number(parts.birthYear);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || year < 1900 || !validDateParts(year, month, day)) {
    return "UNKNOWN";
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  if (year > currentYear || (year === currentYear && (month > currentMonth || (month === currentMonth && day > currentDay)))) {
    return "UNKNOWN";
  }

  let age = currentYear - year;
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 18 ? "ADULT" : "UNDER_18";
}

export function parsePortfolioBirthDate(value: string, now = new Date()): { birthDay: number; birthMonth: number; birthYear: number; isoDate: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  if (birthYear < 1900 || !validDateParts(birthYear, birthMonth, birthDay)) return null;
  if (portfolioSharingAgeStatus({ birthDay, birthMonth, birthYear }, now) === "UNKNOWN") return null;
  return { birthDay, birthMonth, birthYear, isoDate: `${match[1]}-${match[2]}-${match[3]}` };
}

export function privatePortfolioBirthDate(parts: PortfolioBirthDateParts): string | null {
  const day = Number(parts.birthDay);
  const month = Number(parts.birthMonth);
  const year = Number(parts.birthYear);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || !validDateParts(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
