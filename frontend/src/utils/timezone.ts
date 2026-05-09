export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return "UTC";
  }
}

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseLocalDateTimeParts(localDateTimeString: string): LocalDateTimeParts | null {
  const raw = String(localDateTimeString || "").trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] || "0")

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null

  return {
    year,
    month,
    day,
    hour,
    minute,
    second
  }
}

function getTimeZoneOffsetMs(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })

  const parts = formatter.formatToParts(utcDate)
  const year = Number(parts.find(p => p.type === "year")?.value || "0")
  const month = Number(parts.find(p => p.type === "month")?.value || "0")
  const day = Number(parts.find(p => p.type === "day")?.value || "0")
  const hour = Number(parts.find(p => p.type === "hour")?.value || "0")
  const minute = Number(parts.find(p => p.type === "minute")?.value || "0")
  const second = Number(parts.find(p => p.type === "second")?.value || "0")

  const interpretedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return interpretedAsUtc - utcDate.getTime()
}

export function convertLocalToUTC(localDateTimeString: string, timezone?: string): string {
  if (!localDateTimeString) {
    return ""
  }

  const parts = parseLocalDateTimeParts(localDateTimeString)
  if (!parts) {
    const fallbackDate = new Date(localDateTimeString)
    return Number.isNaN(fallbackDate.getTime()) ? "" : fallbackDate.toISOString()
  }

  const tz = timezone || getUserTimezone()

  try {
    if (!timezone) {
      const localDate = new Date(localDateTimeString)
      return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString()
    }

    const utcGuess = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )

    const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), tz)
    let utcTimestamp = utcGuess - firstOffset

    const secondOffset = getTimeZoneOffsetMs(new Date(utcTimestamp), tz)
    if (secondOffset !== firstOffset) {
      utcTimestamp = utcGuess - secondOffset
    }

    return new Date(utcTimestamp).toISOString()
  } catch (error) {
    console.error("Error converting local to UTC:", error)
    const localDate = new Date(localDateTimeString)
    return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString()
  }
}
export function convertUTCToLocal(utcISOString: string | null | undefined, timezone?: string): string {
  if (!utcISOString) {
    return "";
  }
  const tz = timezone || getUserTimezone();
  try {
    const utcDate = new Date(utcISOString);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(utcDate);
    const year = parts.find(p => p.type === "year")?.value || "";
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    const hour = parts.find(p => p.type === "hour")?.value || "";
    const minute = parts.find(p => p.type === "minute")?.value || "";
    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch (error) {
    console.error("Error converting UTC to local:", error);
    const date = new Date(utcISOString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
export function formatDeadlineForDisplay(utcISOString: string | null | undefined, timezone?: string, options?: {
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
}): string {
  if (!utcISOString) {
    return "";
  }
  const tz = timezone || getUserTimezone();
  try {
    const utcDate = new Date(utcISOString);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: tz,
      dateStyle: options?.dateStyle || "short",
      timeStyle: options?.timeStyle || "short"
    }).format(utcDate);
  } catch (error) {
    console.error("Error formatting deadline:", error);
    return new Date(utcISOString).toLocaleString("uk-UA");
  }
}
export function isDeadlineExpired(deadlineUTC: string | null | undefined): boolean {
  if (!deadlineUTC) {
    return false;
  }
  try {
    const deadline = new Date(deadlineUTC);
    const now = new Date();
    return now.getTime() > deadline.getTime();
  } catch (error) {
    console.error("Error checking deadline expiration:", error);
    return false;
  }
}