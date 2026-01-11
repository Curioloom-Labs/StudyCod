export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return "UTC";
  }
}
export function convertLocalToUTC(localDateTimeString: string, timezone?: string): string {
  if (!localDateTimeString) {
    return "";
  }
  const tz = timezone || getUserTimezone();
  try {
    const [datePart, timePart] = localDateTimeString.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const dateInTz = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    const utcString = dateInTz.toISOString();
    const utcDate = new Date(utcString);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(utcDate);
    const tzYear = parseInt(parts.find(p => p.type === "year")?.value || "0");
    const tzMonth = parseInt(parts.find(p => p.type === "month")?.value || "0");
    const tzDay = parseInt(parts.find(p => p.type === "day")?.value || "0");
    const tzHour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
    const tzMinute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
    const localDateInTz = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute));
    const offsetMs = utcDate.getTime() - localDateInTz.getTime();
    const targetLocalDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const utcResult = new Date(targetLocalDate.getTime() - offsetMs);
    return utcResult.toISOString();
  } catch (error) {
    console.error("Error converting local to UTC:", error);
    const localDate = new Date(localDateTimeString);
    const offsetMs = localDate.getTimezoneOffset() * 60 * 1000;
    const utcDate = new Date(localDate.getTime() + offsetMs);
    return utcDate.toISOString();
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