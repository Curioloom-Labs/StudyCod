export function interviewCalendar(row: Record<string, any>, origin: string): string {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(row.scheduled_utc ?? row.scheduled_at);
  const end = new Date(start.getTime() + Number(row.duration_minutes) * 60_000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyCod//Assess Interviews//EN", "BEGIN:VEVENT", `UID:${row.id}@studycod.space`, `DTSTAMP:${stamp(new Date(row.created_at))}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(String(row.title))}`, `DESCRIPTION:${escape(`${row.company_name}\n${origin}/assess/interviews/${row.id}`)}`, `URL:${origin}/assess/interviews/${row.id}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
