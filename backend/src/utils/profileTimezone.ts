export function extractTimezoneFromProfileMeta(rawValue: string | null | undefined): string | null {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return null;

  let timezone: string | null = null;

  if (raw.startsWith("tz:")) {
    const payload = raw.slice(3);
    const [tzRaw] = payload.split("|pp:", 2);
    timezone = String(tzRaw ?? "").trim() || null;
  } else if (raw.startsWith("pp:")) {
    timezone = null;
  } else if (raw.includes("|pp:")) {
    const [tzRaw] = raw.split("|pp:", 2);
    timezone = String(tzRaw ?? "").trim() || null;
  } else {
    timezone = raw.slice(0, 100) || null;
  }

  if (!timezone) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}
