import type { GrowthProjectStageKey } from "./growthProjects";

export type GrowthOracleMutant = "CONTACTS_LAST_WRITE_WINS" | "INVENTORY_PARTIAL_BATCH" | "LOGS_IGNORE_UNIQUE";

const linesOf = (input: string) => input.replace(/\r\n/g, "\n").split("\n");
const words = (line: string) => line.trim().split(/\s+/).filter(Boolean);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const outputOf = (lines: string[]) => lines.length ? `${lines.join("\n")}\n` : "";

function runContacts(input: string, stage: GrowthProjectStageKey, cardId?: string, mutant?: GrowthOracleMutant): string {
  const rows = linesOf(input); const contacts = new Map<string, string>(); const out: string[] = [];
  const phoneOwners = new Map<string, string>();
  const validPhone = (phone: string) => stage === "V1" || /\d/.test(phone);
  const normalize = stage !== "V1" || Boolean(cardId);
  const parseRecord = (line: string) => {
    const parts = words(line); if (parts.length < 2) return null;
    const phone = parts.pop()!; const name = parts.join(" ");
    if (!name || !phone || !validPhone(phone)) return null;
    return { name: normalize ? name.trim() : name, phone: normalize ? phone.trim() : phone };
  };
  const applyImport = (count: number) => {
    let imported = 0; let skipped = 0;
    for (let n = 0; n < count; n++) {
      const record = parseRecord(rows.shift() ?? "");
      if (!record || contacts.has(record.name) || cardId === "contact-conflict" && phoneOwners.has(record.phone)) {
        skipped++; continue;
      }
      contacts.set(record.name, record.phone); phoneOwners.set(record.phone, record.name); imported++;
    }
    out.push(`IMPORTED=${imported} SKIPPED=${skipped}`);
  };
  while (rows.length) {
    const line = rows.shift() ?? ""; const parts = words(line); if (!parts.length) continue;
    const [command, name, phone] = parts;
    if (command === "EXIT") break;
    if (command === "IMPORT" && stage === "V3") {
      const count = Number(parts[1]);
      if (!Number.isInteger(count) || count < 0) { out.push("ERROR"); continue; }
      if (mutant === "CONTACTS_LAST_WRITE_WINS" || cardId === "contact-repeat") {
        let imported = 0; let skipped = 0;
        for (let n = 0; n < count; n++) {
          const record = parseRecord(rows.shift() ?? "");
          if (!record || cardId === "contact-conflict" && phoneOwners.has(record.phone)) { skipped++; continue; }
          const existed = contacts.has(record.name);
          if (existed && mutant !== "CONTACTS_LAST_WRITE_WINS") { skipped++; continue; }
          contacts.set(record.name, record.phone); phoneOwners.set(record.phone, record.name);
          if (existed) skipped++; else imported++;
        }
        out.push(`IMPORTED=${imported} SKIPPED=${skipped}`);
      } else applyImport(count);
      continue;
    }
    if (command === "ADD" || command === "UPDATE") {
      const record = parseRecord(parts.slice(1).join(" "));
      if (!record) { out.push("ERROR"); continue; }
      if (command === "ADD") {
        if (contacts.has(record.name) || cardId === "contact-conflict" && phoneOwners.has(record.phone)) { out.push("EXISTS"); continue; }
        contacts.set(record.name, record.phone); phoneOwners.set(record.phone, record.name); out.push("OK");
      } else {
        if (!contacts.has(record.name)) { out.push("NOT_FOUND"); continue; }
        phoneOwners.delete(contacts.get(record.name)!);
        contacts.set(record.name, record.phone); phoneOwners.set(record.phone, record.name); out.push("OK");
      }
    } else if (command === "GET") {
      out.push(contacts.has(name) ? `${name} ${contacts.get(name)}` : "NOT_FOUND");
    } else if (command === "DELETE") {
      if (!contacts.has(name)) out.push("NOT_FOUND");
      else { phoneOwners.delete(contacts.get(name)!); contacts.delete(name); out.push("OK"); }
    } else if (command === "LIST") {
      const entries = [...contacts].sort(([a], [b]) => compareText(a, b)).map(([contactName, contactPhone]) => `${contactName} ${contactPhone}`);
      out.push(entries.length ? entries.join(",") : "EMPTY");
    } else out.push("ERROR");
  }
  return outputOf(out);
}

type Stock = { quantity: number; price: number };
function runInventory(input: string, stage: GrowthProjectStageKey, cardId?: string, mutant?: GrowthOracleMutant): string {
  const rows = linesOf(input); const stock = new Map<string, Stock>(); const log: string[] = []; const out: string[] = [];
  const operationIds = new Set<string>();
  const apply = (line: string, target: Map<string, Stock>, includeIds = false): { ok: boolean; message: string; entry?: string } => {
    const parts = words(line); const [command, name] = parts;
    const quantity = Number(parts[2]);
    const opId = includeIds ? parts[3] : undefined;
    if (!["ISSUE", "RESTOCK"].includes(command) || !name || !Number.isInteger(quantity) || quantity <= 0) return { ok: false, message: "ERROR" };
    if (opId && operationIds.has(opId)) return { ok: false, message: "DUPLICATE" };
    const item = target.get(name);
    if (!item) return { ok: false, message: "NOT_FOUND" };
    if (command === "ISSUE" && item.quantity < quantity) return { ok: false, message: "INSUFFICIENT_STOCK" };
    item.quantity += command === "RESTOCK" ? quantity : -quantity;
    if (opId) operationIds.add(opId);
    return { ok: true, message: "OK", entry: `${command} ${name} ${quantity}` };
  };
  const readBatch = (count: number) => {
    const operations = Array.from({ length: count }, () => rows.shift() ?? "");
    const next = new Map([...stock].map(([name, item]) => [name, { ...item }]));
    const entries: string[] = []; let invalid = false;
    for (const operation of operations) {
      const result = apply(operation, next);
      if (!result.ok) { invalid = true; if (mutant === "INVENTORY_PARTIAL_BATCH") break; }
      else if (result.entry) entries.push(result.entry);
    }
    if (invalid) {
      if (mutant === "INVENTORY_PARTIAL_BATCH") {
        for (const [name, item] of next) stock.set(name, item);
        log.push(...entries);
      }
      out.push("BATCH_REJECTED");
    } else {
      for (const [name, item] of next) stock.set(name, item);
      log.push(...entries); out.push(`APPLIED=${count}`);
    }
  };
  while (rows.length) {
    const line = rows.shift() ?? ""; const parts = words(line); if (!parts.length) continue;
    const [command, name] = parts;
    if (command === "ADD") {
      const quantity = Number(parts[2]); const price = Number(parts[3]);
      if (!name || !Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(price) || price < 0) out.push("ERROR");
      else if (stock.has(name)) out.push("EXISTS");
      else { stock.set(name, { quantity, price }); out.push("OK"); }
    } else if (command === "GET") {
      const item = stock.get(name); out.push(item ? `${name} ${item.quantity} ${item.price}` : "NOT_FOUND");
    } else if (command === "REMOVE") {
      out.push(stock.delete(name) ? "OK" : "NOT_FOUND");
    } else if (command === "LIST") {
      const items = [...stock].sort(([a], [b]) => compareText(a, b)).map(([itemName, item]) => `${itemName} ${item.quantity} ${item.price}`);
      out.push(items.join(","));
    } else if (command === "VALUE") {
      out.push(String([...stock.values()].reduce((sum, item) => sum + item.quantity * item.price, 0)));
    } else if (command === "RESTOCK" || command === "ISSUE") {
      const result = apply(line, stock, cardId === "stock-retry");
      if (result.entry && stage === "V3") log.push(result.entry);
      out.push(result.message);
    } else if (command === "BATCH" && stage === "V3") {
      const count = Number(parts[1]);
      if (!Number.isInteger(count) || count < 0) out.push("ERROR"); else readBatch(count);
    } else if (command === "SHOWLOG" && stage === "V3") out.push(log.join(","));
    else out.push("ERROR");
  }
  return outputOf(out);
}

type LogRow = { timestamp: string; level: "INFO" | "WARN" | "ERROR"; event: string };
function runLogs(input: string, stage: GrowthProjectStageKey, cardId?: string, mutant?: GrowthOracleMutant): string {
  const rows = linesOf(input); let levelFilter: string | null = null; let from: string | null = null; let to: string | null = null; let unique = false; let report: string | null = null;
  const malformedRows: string[] = []; const parsed: LogRow[] = [];
  const contentRows = /(?:\r\n|\n)$/.test(input) ? rows.slice(0, -1) : rows;
  for (const raw of contentRows) {
    const line = raw.trim(); if (!line) { malformedRows.push(raw); continue; }
    const tokens = words(line);
    if (stage !== "V1" && tokens[0] === "--level" && tokens.length === 2) { levelFilter = tokens[1]; continue; }
    if (stage !== "V1" && tokens[0] === "--from" && tokens.length === 4 && tokens[2] === "--to") { from = tokens[1]; to = tokens[3]; continue; }
    if (stage === "V3" && tokens[0] === "--unique" && tokens.length === 1) { unique = true; continue; }
    if (stage === "V3" && tokens[0] === "REPORT" && tokens.length === 2) { report = tokens[1]; continue; }
    const match = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
    if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(match[1]) || !["INFO", "WARN", "ERROR"].includes(match[2]) || !match[3].trim()) { malformedRows.push(raw); continue; }
    parsed.push({ timestamp: match[1], level: match[2] as LogRow["level"], event: match[3].trim() });
  }
  let events = parsed;
  if (unique && mutant !== "LOGS_IGNORE_UNIQUE") {
    const seen = new Set<string>();
    events = parsed.filter(row => { const key = `${row.timestamp}\0${row.level}\0${row.event}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }
  events = events.filter(row => (!levelFilter || row.level === levelFilter) && (!from || row.timestamp >= from) && (!to || row.timestamp <= to));
  const counts = { INFO: 0, WARN: 0, ERROR: 0 };
  for (const row of events) counts[row.level]++;
  const output = [`INFO=${counts.INFO}`, `WARN=${counts.WARN}`, `ERROR=${counts.ERROR}`, `events=${events.length}`, `malformed=${malformedRows.length}`];
  if (stage === "V3" && report && ["INFO", "WARN", "ERROR"].includes(report)) {
    const frequencies = new Map<string, number>();
    for (const row of events) if (row.level === report) frequencies.set(row.event, (frequencies.get(row.event) ?? 0) + 1);
    output.push(...[...frequencies].sort(([aName, aCount], [bName, bCount]) => bCount - aCount || compareText(aName, bName)).map(([event, count]) => `${event}=${count}`));
  }
  return outputOf(output);
}

function runSensorTransfer(input: string): string {
  const ids = new Set<string>(); const values: number[] = []; let duplicates = 0; let malformed = 0;
  for (const line of linesOf(input)) {
    if (!line.trim()) continue;
    const [command, id, timestamp, rawValue, extra] = words(line);
    const value = Number(rawValue);
    if (command !== "READ" || !id || !/^\d{4}-\d{2}-\d{2}$/.test(timestamp ?? "") || !Number.isFinite(value) || extra !== undefined) { malformed++; continue; }
    if (ids.has(id)) { duplicates++; continue; }
    ids.add(id); values.push(value);
  }
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return `accepted=${values.length}\nduplicates=${duplicates}\nmalformed=${malformed}\nmean=${mean.toFixed(2)}\n`;
}

function runDeliveryTransfer(input: string): string {
  const ids = new Set<string>(); let created = 0; let moving = 0; let delivered = 0; let duplicates = 0; let malformed = 0;
  for (const line of linesOf(input)) {
    if (!line.trim()) continue;
    const [id, status, extra] = words(line);
    if (!id || !["CREATED", "MOVING", "DELIVERED"].includes(status) || extra !== undefined) { malformed++; continue; }
    if (ids.has(id)) { duplicates++; continue; }
    ids.add(id); if (status === "CREATED") created++; else if (status === "MOVING") moving++; else delivered++;
  }
  return `CREATED=${created}\nMOVING=${moving}\nDELIVERED=${delivered}\nduplicates=${duplicates}\nmalformed=${malformed}\n`;
}

function runIdentifierAuditTransfer(input: string): string {
  const records = new Map<string, string>(); let duplicates = 0; let conflicts = 0; let malformed = 0;
  for (const line of linesOf(input)) {
    if (!line.trim()) continue;
    const parts = words(line); if (parts.length !== 3) { malformed++; continue; }
    const [id, category, value] = parts; const record = `${category} ${value}`;
    if (!records.has(id)) records.set(id, record);
    else if (records.get(id) === record) duplicates++;
    else conflicts++;
  }
  return `accepted=${records.size}\nduplicates=${duplicates}\nconflicts=${conflicts}\nmalformed=${malformed}\n`;
}

function runContactsTransfer(input: string, cardId: string): string {
  const rows = linesOf(input); const out: string[] = [];
  if (cardId === "transfer-resources") {
    const available = new Map<string, number>();
    for (const line of rows) {
      if (!line.trim()) continue;
      const [command, name, raw] = words(line); const amount = Number(raw);
      if (command === "RESOURCE") { if (name && Number.isInteger(amount) && amount >= 0) { available.set(name, amount); out.push("OK"); } else out.push("ERROR"); }
      else if (command === "ALLOCATE" || command === "RELEASE") {
        if (!name || !Number.isInteger(amount) || amount <= 0) out.push("ERROR");
        else if (!available.has(name)) out.push("NOT_FOUND");
        else if (command === "ALLOCATE" && available.get(name)! < amount) out.push("INSUFFICIENT");
        else { available.set(name, available.get(name)! + (command === "ALLOCATE" ? -amount : amount)); out.push("OK"); }
      } else if (command === "GET") out.push(available.has(name) ? `${name} ${available.get(name)}` : "NOT_FOUND");
      else out.push("ERROR");
    }
    return outputOf(out);
  }
  const records = new Map<string, { name: string; detail: string }>(); const emails = new Set<string>();
  const add = (line: string, hasCommand = true) => {
    const parts = words(line); const offset = hasCommand ? 1 : 0; const name = parts[offset]?.trim(); const rawDetail = parts.slice(offset + 1).join(" ").trim();
    if (!name || !rawDetail) return false;
    if (cardId === "transfer-attendees") {
      const email = rawDetail.toLowerCase(); if (!email.includes("@")) return false;
      if (emails.has(email)) return false;
      emails.add(email); records.set(name, { name, detail: email }); return true;
    }
    const key = cardId === "transfer-members" ? name.toLowerCase() : name;
    if (records.has(key)) return false;
    records.set(key, { name, detail: rawDetail }); return true;
  };
  const sortedList = () => [...records.values()].sort((a, b) => compareText(a.name, b.name)).map(row => `${row.name} ${row.detail}`).join(",");
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index]; if (!line.trim()) continue;
    const parts = words(line); const [command, name] = parts;
    if (cardId === "transfer-attendees" && command === "REGISTER") out.push(add(line) ? "OK" : "EXISTS");
    else if (cardId === "transfer-members" && command === "MEMBER") out.push(add(line) ? "OK" : "EXISTS");
    else if (cardId === "transfer-attendees" && command === "IMPORT" || cardId === "transfer-members" && command === "BATCH") {
      const count = Number(parts[1]); let imported = 0; let skipped = 0;
      for (let n = 0; n < count; n++) { if (add(rows[++index] ?? `INVALID`, false)) imported++; else skipped++; }
      out.push(`IMPORTED=${imported} SKIPPED=${skipped}`);
    } else if (command === "LIST") out.push(sortedList() || "EMPTY");
    else out.push("ERROR");
  }
  return outputOf(out);
}

function runInventoryTransfer(input: string, cardId: string): string {
  const rows = linesOf(input); const out: string[] = [];
  const remaining = new Map<string, number>(); const history: string[] = [];
  if (cardId === "transfer-ledger") {
    for (const line of rows) {
      if (!line.trim()) continue;
      const [command, name, raw] = words(line); const count = Number(raw);
      if (command === "MATERIAL") { if (name && Number.isInteger(count) && count >= 0) { remaining.set(name, count); out.push("OK"); } else out.push("ERROR"); }
      else if (command === "USE") {
        if (!Number.isInteger(count) || count <= 0) out.push("ERROR");
        else if (!remaining.has(name)) out.push("NOT_FOUND");
        else if (remaining.get(name)! < count) out.push("INSUFFICIENT");
        else { remaining.set(name, remaining.get(name)! - count); history.push(`${name} ${count}`); out.push("OK"); }
      } else if (command === "HISTORY") out.push(history.join(","));
      else out.push("ERROR");
    }
    return outputOf(out);
  }
  if (cardId === "transfer-bookings") {
    const capacity = new Map<string, number>(); const used = new Map<string, number>();
    for (let index = 0; index < rows.length; index++) {
      const line = rows[index]; if (!line.trim()) continue;
      const parts = words(line); const [command, name] = parts;
      if (command === "ROOM") { const value = Number(parts[2]); if (name && Number.isInteger(value) && value >= 0) { capacity.set(name, value); used.set(name, 0); out.push("OK"); } else out.push("ERROR"); }
      else if (command === "BATCH") {
        const count = Number(parts[1]); const ops = Array.from({ length: count }, () => words(rows[++index] ?? ""));
        const next = new Map(used); let valid = Number.isInteger(count) && count >= 0;
        for (const [op, room, rawSeats] of ops) { const seats = Number(rawSeats); if (op !== "BOOK" || !room || !Number.isInteger(seats) || seats <= 0 || !capacity.has(room) || (next.get(room) ?? 0) + seats > (capacity.get(room) ?? 0)) { valid = false; break; } next.set(room, (next.get(room) ?? 0) + seats); }
        if (!valid) out.push("BATCH_REJECTED"); else { for (const [room, seats] of next) used.set(room, seats); out.push(`APPLIED=${count}`); }
      } else if (command === "GET") out.push(capacity.has(name) ? `${name} ${(capacity.get(name) ?? 0) - (used.get(name) ?? 0)}` : "NOT_FOUND");
      else out.push("ERROR");
    }
    return outputOf(out);
  }
  const stock = new Map<string, number>();
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index]; if (!line.trim()) continue;
    const parts = words(line); const [command, id] = parts;
    if (command === "STOCK") { const count = Number(parts[2]); if (id && Number.isInteger(count) && count >= 0) { stock.set(id, count); out.push("OK"); } else out.push("ERROR"); }
    else if (command === "BATCH") {
      const count = Number(parts[1]); const ops = Array.from({ length: count }, () => words(rows[++index] ?? "")); const next = new Map(stock); let valid = Number.isInteger(count) && count >= 0;
      for (const [op, parcel, rawCount] of ops) { const amount = Number(rawCount); if (op !== "DISPATCH" || !parcel || !Number.isInteger(amount) || amount <= 0 || !next.has(parcel) || next.get(parcel)! < amount) { valid = false; break; } next.set(parcel, next.get(parcel)! - amount); }
      if (!valid) out.push("BATCH_REJECTED"); else { for (const [parcel, amount] of next) stock.set(parcel, amount); out.push(`APPLIED=${count}`); }
    } else if (command === "DISPATCH") { const amount = Number(parts[2]); if (!Number.isInteger(amount) || amount <= 0) out.push("ERROR"); else if (!stock.has(id)) out.push("NOT_FOUND"); else if (stock.get(id)! < amount) out.push("INSUFFICIENT"); else { stock.set(id, stock.get(id)! - amount); out.push("OK"); } }
    else if (command === "GET") out.push(stock.has(id) ? `${id} ${stock.get(id)}` : "NOT_FOUND");
    else out.push("ERROR");
  }
  return outputOf(out);
}

export function runGrowthProjectReference(family: "contacts" | "inventory" | "logs", stage: GrowthProjectStageKey, input: string, mutant?: GrowthOracleMutant): string {
  if (family === "contacts") return runContacts(input, stage, undefined, mutant);
  if (family === "inventory") return runInventory(input, stage, undefined, mutant);
  return runLogs(input, stage, undefined, mutant);
}

export function runGrowthCardReference(family: "contacts" | "inventory" | "logs", cardId: string, input: string): string {
  if (cardId.startsWith("transfer-")) {
    if (family === "contacts") return runContactsTransfer(input, cardId);
    if (family === "inventory") return runInventoryTransfer(input, cardId);
    if (cardId === "transfer-sensor-events") return runSensorTransfer(input);
    if (cardId === "transfer-delivery-events") return runDeliveryTransfer(input);
    return runIdentifierAuditTransfer(input);
  }
  if (family === "contacts") return runContacts(input, "V3", cardId);
  if (family === "inventory") return runInventory(input, "V3", cardId);
  return runLogs(input, "V3", cardId);
}
