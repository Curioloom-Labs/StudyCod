import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, parseStudentRoster } from "./studentRoster";
import { importedStudentSchema, studentInputSchema } from "./studentProvisionBatch";

test("roster import supports localized headers and comma/semicolon/tab formats", () => {
  for (const separator of [",", ";", "\t"]) {
    const csv = `\uFEFFПрізвище${separator}Імʼя${separator}Email${separator}Password\r\nПетренко${separator}Іван${separator}IVAN@example.invalid${separator}Abcdef12`;
    const [row] = parseStudentRoster(csv);
    assert.equal(row.lastName, "Петренко"); assert.equal(row.firstName, "Іван");
    assert.equal(row.email, "ivan@example.invalid"); assert.equal(row.password, "Abcdef12");
  }
});
test("quoted delimiters, escaped quotes and logical newlines do not split students", () => {
  const rows = parseStudentRoster('Last name,First name,Middle name\n"Smith, Jr.","John ""Jack""","Middle\nName"\nJones,Jane,');
  assert.equal(rows.length, 2); assert.equal(rows[0].lastName, "Smith, Jr."); assert.equal(rows[0].firstName, 'John "Jack"');
  assert.equal(rows[1].firstName, "Jane");
});
test("malformed quotes, incomplete names, invalid email and password reject the entire import with line numbers", () => {
  for (const csv of ['Last name,First name\n"Smith,John', 'Last name,First name\nSmith,', 'Last name,First name,Email\nSmith,John,no-mail',
    'Last name,First name,Password\nSmith,John,short', 'Last name,First name\n"Smith"oops,John']) {
    assert.throws(() => parseStudentRoster(csv), (error: any) => error.statusCode === 400 && error.message === "INVALID_STUDENT_IMPORT" && error.invalidLines.includes(2));
  }
});
test("plain names follow the same surname-first contract as the pasted class list", () => {
  assert.equal(parseStudentRoster('Петренко Іван Іванович')[0].firstName, "Іван");
  assert.equal(parseStudentRoster('Петренко;Іван;Іванович')[0].lastName, "Петренко");
  assert.throws(() => parseStudentRoster('Email\nivan@example.invalid'));
});
test("blank prefix lines retain source row numbers and ambiguous headers are rejected", () => {
  assert.equal(parseStudentRoster('\n\nLast name;First name\nSmith;John')[0].firstName, "John");
  assert.throws(() => parseStudentRoster('\nLast name;First name\nSmith;'), (error: any) => error.invalidLines.includes(3));
  assert.throws(() => parseStudentRoster('Last name,First name,Email,E-mail\nSmith,John,a@example.invalid,b@example.invalid'), (error: any) => error.invalidLines.includes(1));
});
test("credential schema bounds fields and bcrypt bytes without coercing input", () => {
  assert.equal(studentInputSchema.safeParse({ firstName: "A".repeat(101), lastName: "B" }).success, false);
  assert.equal(importedStudentSchema.safeParse({ firstName: "A", lastName: "B", username: "normal-login", password: "Abcdef12" }).success, true);
  for (const password of ["x".repeat(73), "я".repeat(40), "line\nbreak"])
    assert.equal(importedStudentSchema.safeParse({ firstName: "A", lastName: "B", password }).success, false);
});
test("CSV export quotes values and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('John "Jack"'), '"John ""Jack"""');
  assert.equal(csvCell('=HYPERLINK("https://example.invalid")'), '"\'=HYPERLINK(""https://example.invalid"")"');
  assert.equal(csvCell("  +1"), '"\'  +1"'); assert.equal(csvCell("Name"), '"Name"');
});
