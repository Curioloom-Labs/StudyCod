import test from "node:test";
import assert from "node:assert/strict";
import { buildStudentExport } from "./dataPrivacy";

test("buildStudentExport shapes student + grades into a portable object", () => {
  const now = new Date("2026-06-15T10:00:00.000Z");
  const student: any = {
    id: 5,
    firstName: "Anna",
    lastName: "Koval",
    middleName: null,
    email: "anna@example.com",
    birthDate: "2012-03-01",
    parentalConsentAt: new Date("2026-01-10T08:00:00.000Z"),
    class: { id: 7 }
  };
  const eduGrades: any[] = [
    { id: 1, total: 88, type: "PRACTICE", isCompleted: true, createdAt: new Date("2026-05-01T00:00:00.000Z") }
  ];
  const summaryGrades: any[] = [
    { id: 2, name: "THEMATIC", assessmentType: "INTERMEDIATE", grade: 90, semester: 1 }
  ];

  const out = buildStudentExport(student, eduGrades, summaryGrades, now);

  assert.equal(out.exportedAt, "2026-06-15T10:00:00.000Z");
  assert.equal(out.student.id, 5);
  assert.equal(out.student.classId, 7);
  assert.equal(out.student.birthDate, "2012-03-01");
  assert.equal(out.student.parentalConsentAt, "2026-01-10T08:00:00.000Z");
  assert.equal(out.grades.length, 1);
  assert.equal(out.grades[0].total, 88);
  assert.equal(out.summaryGrades[0].grade, 90);
  assert.equal(out.summaryGrades[0].assessmentType, "INTERMEDIATE");
});

test("buildStudentExport tolerates missing consent/class and empty grades", () => {
  const student: any = {
    id: 1,
    firstName: "B",
    lastName: "C",
    middleName: null,
    email: "b@c.com",
    birthDate: null,
    parentalConsentAt: null,
    class: null
  };
  const out = buildStudentExport(student, [], []);
  assert.equal(out.student.classId, null);
  assert.equal(out.student.parentalConsentAt, null);
  assert.deepEqual(out.grades, []);
  assert.deepEqual(out.summaryGrades, []);
});
