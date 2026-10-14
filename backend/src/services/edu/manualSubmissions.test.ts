import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { ManualSubmission } from "../../entities/ManualSubmission";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { validateManualSubmission, upsertSubmission, gradeManualSubmission, manualSubmissionRevision } from "./manualSubmissions";
import * as gradebookWrites from "./gradebookWrites";

test("manual answer requires content and enforces the text limit", () => {
  assert.equal(validateManualSubmission({ text: "   " }).error, "EMPTY_SUBMISSION");
  assert.equal(validateManualSubmission({ text: "x".repeat(50_001) }).error, "TEXT_TOO_LONG");
  assert.equal(validateManualSubmission({ fileStorageKey: "k" }).ok, true);
});

function fixture(t: any, existing: any = null) {
  let submission = existing;
  let grade: any = null;
  let locked = false;
  const task: any = { id: 7, taskMode: "MANUAL", rubric: [{ id: "a", maxPoints: 20 }], lesson: { type: "LESSON" } };
  const manager: any = {
    createQueryBuilder: () => ({ setLock: (mode: string) => {
      assert.equal(mode, "pessimistic_write");
      return { where: () => ({ getOne: async () => { locked = true; return { id: 3 }; } }) };
    } }),
    getRepository: (entity: any) => {
      assert.equal(locked, true, "acquire the student lock before reading mutable state");
      if (entity === EduTask) return { findOne: async () => task };
      if (entity === ManualSubmission) return {
        findOne: async () => submission, create: (v: any) => ({ id: 1, ...v }),
        save: async (v: any) => { submission = { ...v, updatedAt: new Date() }; return submission; }
      };
      if (entity === EduGrade) return { findOne: async () => grade, create: (v: any) => v,
        save: async (v: any) => { grade = v; return grade; } };
      throw new Error("unexpected repository");
    }
  };
  t.mock.method(AppDataSource, "transaction", async (isolation: any, work: any) => {
    assert.equal(isolation, "SERIALIZABLE"); locked = false; return work(manager);
  });
  t.mock.method(gradebookWrites, "withStudentGradeWrite", async (_studentId: any, _classId: any, actor: any, work: any) => {
    assert.equal(actor.userId, 10); locked = true;
    return work(manager, { id: 3, class: { id: 22 } });
  });
  return { task, getSubmission: () => submission, getGrade: () => grade };
}

test("new manual submission retains its text and file", async t => {
  fixture(t);
  const { submission } = await upsertSubmission(7, 3, { text: "answer", fileStorageKey: "new", fileName: "new.pdf" });
  assert.equal(submission.text, "answer");
  assert.equal(submission.fileStorageKey, "new");
  assert.equal(submission.status, "SUBMITTED");
});

test("text-only resubmission preserves the existing attachment", async t => {
  fixture(t, { id: 1, text: "old", status: "SUBMITTED", fileStorageKey: "oldkey", fileName: "old.pdf" });
  const saved = await upsertSubmission(7, 3, { text: "new" });
  assert.equal(saved.submission.fileStorageKey, "oldkey");
  assert.equal(saved.submission.fileName, "old.pdf");
  assert.equal(saved.replacedFileStorageKey, null);
});

test("attachment replacement returns only the file actually replaced under the lock", async t => {
  fixture(t, { id: 1, status: "SUBMITTED", fileStorageKey: "currentkey" });
  const saved = await upsertSubmission(7, 3, { fileStorageKey: "newkey", fileName: "new.pdf" });
  assert.equal(saved.replacedFileStorageKey, "currentkey");
  assert.equal(saved.submission.fileStorageKey, "newkey");
});

test("graded submission cannot be reopened even if the route previously read SUBMITTED", async t => {
  const f = fixture(t, { id: 1, text: "old", status: "GRADED" });
  await assert.rejects(upsertSubmission(7, 3, { text: "new" }), /SUBMISSION_ALREADY_GRADED/);
  assert.equal(f.getSubmission().text, "old");
});

test("grading commits raw points, normalized percentage and status, including zero", async t => {
  const existing: any = { id: 1, text: "answer", status: "SUBMITTED" };
  const f = fixture(t, existing);
  const result = await gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, {
    total: 10, maxScore: 20, feedback: "good", expectedRevision: manualSubmissionRevision(existing)
  }, { userId: 10 });
  assert.equal(result.grade.total, 50);
  assert.equal(result.grade.score, 10);
  assert.equal(f.getSubmission().status, "GRADED");
  assert.equal(result.revision, manualSubmissionRevision(f.getSubmission(), f.getGrade()));
  const zero = await gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 0, maxScore: 20, feedback: null, expectedRevision: result.revision }, { userId: 10 });
  assert.equal(zero.grade.total, 0);
});

test("teacher cannot grade a response replaced after it was opened", async t => {
  const old: any = { id: 1, text: "old", status: "SUBMITTED", updatedAt: new Date(0) };
  const revision = manualSubmissionRevision(old);
  const f = fixture(t, { ...old, text: "new" });
  await assert.rejects(gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 10, maxScore: 20, feedback: null, expectedRevision: revision }, { userId: 10 }), /SUBMISSION_CHANGED/);
  assert.equal(f.getGrade(), null);
  assert.equal(f.getSubmission().status, "SUBMITTED");
});

test("changed rubric cannot silently change the denominator", async t => {
  const f = fixture(t, { id: 1, status: "SUBMITTED", text: "answer" });
  await assert.rejects(gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 10, maxScore: 100, feedback: null, expectedRevision: manualSubmissionRevision(f.getSubmission()) }, { userId: 10 }), /RUBRIC_CHANGED/);
  assert.equal(f.getGrade(), null);
});

test("stale manual review cannot overwrite a grade or feedback even with unchanged artifact timestamp", async t => {
  const f = fixture(t, { id: 1, text: "answer", status: "GRADED", updatedAt: new Date(0) });
  const initial = manualSubmissionRevision(f.getSubmission());
  const first = await gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 12, maxScore: 20, feedback: "first", expectedRevision: initial }, { userId: 10 });
  const stale = first.revision;
  f.getGrade().feedback = "another teacher";
  await assert.rejects(gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 5, maxScore: 20, feedback: "stale", expectedRevision: stale }, { userId: 10 }), /SUBMISSION_CHANGED/);
  assert.equal(f.getGrade().feedback, "another teacher");
  assert.equal(f.getGrade().score, 12);
  await assert.rejects(gradeManualSubmission(f.task, { id: 3, class: { id: 22 } } as any, { total: 5, maxScore: 20, feedback: "unversioned" }, { userId: 10 }), /REVIEW_REVISION_REQUIRED/);
});


test("manual submit rechecks closure and deadline inside the transaction", async t => {
  const f = fixture(t, { id: 1, text: "old", status: "SUBMITTED" });
  f.task.isClosed = true;
  await assert.rejects(upsertSubmission(7, 3, { text: "new" }), /TASK_IS_CLOSED/);
  f.task.isClosed = false;
  f.task.deadline = new Date(0);
  await assert.rejects(upsertSubmission(7, 3, { text: "new" }), /DEADLINE_PASSED/);
  assert.equal(f.getSubmission().text, "old");
});
