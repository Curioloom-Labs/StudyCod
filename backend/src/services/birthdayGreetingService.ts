import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { emailService } from "./emailService";
import { logger } from "../utils/logger";

export function isLeapYear(year: number): boolean {
  // Leap year rule: divisible by 4, except centuries not divisible by 400.
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function getBirthdayMatchParams(date: Date): { month: number; days: number[] } {
  const month = date.getMonth() + 1; // JS: 0-11
  const day = date.getDate();

  // Handle Feb 29 birthdays on non-leap years:
  // send on Feb 28 when Feb 29 doesn't exist.
  if (month === 2 && day === 28 && !isLeapYear(date.getFullYear())) {
    return { month, days: [28, 29] };
  }

  return { month, days: [day] };
}

export type SendBirthdayGreetingsResult = {
  date: string;
  candidates: number;
  reserved: number;
  sent: number;
  skippedAlreadyReservedOrSent: number;
  failed: number;
  dryRun: boolean;
};

export async function sendBirthdayGreetingsForDate(date: Date, opts?: { dryRun?: boolean; limit?: number }): Promise<SendBirthdayGreetingsResult> {
  const dryRun = Boolean(opts?.dryRun);
  const limit = opts?.limit && Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : undefined;

  const repo = AppDataSource.getRepository(User);
  const { month, days } = getBirthdayMatchParams(date);
  const year = date.getFullYear();
  const dateIso = new Date(date);
  dateIso.setHours(0, 0, 0, 0);

  const qb = repo
    .createQueryBuilder("u")
    .where("u.email_verified = 1")
    .andWhere("u.email IS NOT NULL")
    .andWhere("u.email <> ''")
    .andWhere("u.birth_month = :month", { month })
    .andWhere("u.birth_day IN (:...days)", { days })
    .andWhere("(u.birthday_greeted_year IS NULL OR u.birthday_greeted_year <> :year)", { year })
    .orderBy("u.id", "ASC");

  if (limit) qb.limit(limit);

  const users = await qb.getMany();

  let reserved = 0;
  let sent = 0;
  let skippedAlreadyReservedOrSent = 0;
  let failed = 0;

  if (dryRun) {
    return {
      date: dateIso.toISOString(),
      candidates: users.length,
      reserved: 0,
      sent: 0,
      skippedAlreadyReservedOrSent: 0,
      failed: 0,
      dryRun: true,
    };
  }

  for (const user of users) {
    // Reserve (best-effort): ensures at-most-once per year even with multiple instances.
    // NOTE: this can cause a missed email if the process crashes after reservation.
    // This tradeoff is intentional to avoid duplicate greetings.
    const prevYear = user.birthdayGreetedYear ?? null;

    try {
      const reserveRes = await repo
        .createQueryBuilder()
        .update(User)
        .set({ birthdayGreetedYear: year })
        .where("id = :id", { id: user.id })
        .andWhere("(birthday_greeted_year IS NULL OR birthday_greeted_year <> :year)", { year })
        .execute();

      if ((reserveRes.affected ?? 0) !== 1) {
        skippedAlreadyReservedOrSent++;
        continue;
      }

      reserved++;

      await emailService.sendBirthdayGreetingEmail({
        to: String(user.email),
        username: user.username,
        firstName: user.firstName,
      });

      sent++;
    } catch (err: any) {
      failed++;
      logger.error("[birthday] failed to send greeting", {
        userId: user.id,
        email: user.email,
        message: err?.message,
      });

      // Roll back reservation so it can be retried later.
      try {
        await repo
          .createQueryBuilder()
          .update(User)
          .set({ birthdayGreetedYear: prevYear })
          .where("id = :id", { id: user.id })
          .andWhere("birthday_greeted_year = :year", { year })
          .execute();
      } catch {
        // Ignore rollback failures.
      }
    }
  }

  logger.info("[birthday] greeting run complete", {
    date: dateIso.toISOString(),
    month,
    days,
    year,
    candidates: users.length,
    reserved,
    sent,
    skippedAlreadyReservedOrSent,
    failed,
  });

  return {
    date: dateIso.toISOString(),
    candidates: users.length,
    reserved,
    sent,
    skippedAlreadyReservedOrSent,
    failed,
    dryRun: false,
  };
}
