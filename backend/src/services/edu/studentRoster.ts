import { importedStudentSchema, type ImportedStudentInput } from "./studentProvisionBatch";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const headerKey = (value: string) => value.toLowerCase().replace(/["'’ʼ`´]/g, "").replace(/[\s_-]/g, "");
const aliases = { firstName: ["імя", "имя", "firstname", "first"], lastName: ["прізвище", "призвище", "lastname", "last"],
  middleName: ["побатькові", "middlename", "middle"], email: ["email", "emailaddress", "емейл"],
  fullName: ["піб", "fullname", "name"], username: ["username", "login", "логін", "логин"], password: ["password", "пароль", "studentpassword", "парольучня", "loginpassword", "парольдлявходу"] };
const invalid = (lines: number[] = []): never => { throw Object.assign(new Error("INVALID_STUDENT_IMPORT"), { statusCode: 400, invalidLines: lines.slice(0, 50) }); };

/** Parse logical records, including quoted newlines, in comma, semicolon or tab exports. */
export function parseStudentRoster(raw: string): ImportedStudentInput[] {
  let text = raw.replace(/^\uFEFF/, ""), leadingLines = 0;
  while (/^[ \t]*(?:\r\n|\n|\r)/.test(text)) { text = text.replace(/^[ \t]*(?:\r\n|\n|\r)/, ""); leadingLines++; }
  let quote = false; const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < text.length; i++) { const ch = text[i]; if (ch === '"') { if (quote && text[i + 1] === '"') i++; else quote = !quote; } else if (!quote && ch === "\n") break; else if (!quote && ch in counts) counts[ch]++; }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const records: Array<{ cells: string[]; line: number }> = []; let cells: string[] = [], cell = "", quoted = false, closed = false, line = leadingLines + 1, startLine = leadingLines + 1;
  const pushCell = () => { cells.push(cell); cell = ""; closed = false; };
  const pushRecord = () => { pushCell(); if (cells.some(value => value.trim())) records.push({ cells, line: startLine }); cells = []; startLine = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else { cell += ch; if (ch === "\n") line++; } continue; }
    if (ch === '"') { if (cell.trim() || closed) invalid([line]); cell = ""; quoted = true; }
    else if (ch === delimiter) pushCell();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; pushRecord(); line++; }
    else if (closed) { if (!/\s/.test(ch)) invalid([line]); }
    else cell += ch;
  }
  if (quoted) invalid([startLine]); pushRecord();
  if (!records.length || records.length > 201) invalid();
  const keys = records[0].cells.map(value => headerKey(value.trim()));
  const index = (field: keyof typeof aliases) => keys.findIndex(key => aliases[field].includes(key));
  const hasHeader = Object.keys(aliases).some(field => index(field as keyof typeof aliases) >= 0);
  if (hasHeader && Object.values(aliases).some(options => keys.filter(key => options.includes(key)).length > 1)) invalid([records[0].line]);
  if (hasHeader && index("fullName") < 0 && (index("firstName") < 0 || index("lastName") < 0)) invalid([records[0].line]);
  const rows: ImportedStudentInput[] = [], errors: number[] = [];
  for (const record of records.slice(hasHeader ? 1 : 0)) {
    const get = (field: keyof typeof aliases) => index(field) >= 0 ? record.cells[index(field)] || "" : "";
    const full = hasHeader ? get("fullName") : record.cells.length === 1 ? record.cells[0] : "";
    const words = full.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "").split(/\s+/);
    const input = { firstName: full ? words[1] || "" : hasHeader ? get("firstName") : record.cells[1] || "",
      lastName: full ? words[0] || "" : hasHeader ? get("lastName") : record.cells[0] || "",
      middleName: full ? words.slice(2).join(" ") : hasHeader ? get("middleName") : record.cells[2] || "",
      email: hasHeader ? get("email") : record.cells[3] || "",
      ...(hasHeader && get("username").trim() ? { username: get("username").trim() } : {}),
      ...(hasHeader && get("password") ? { password: get("password") } : {}) };
    const result = importedStudentSchema.safeParse(input); if (!result.success) errors.push(record.line); else rows.push(result.data);
  }
  if (!rows.length || rows.length > 200 || errors.length) invalid(errors);
  return rows;
}
