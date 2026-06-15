import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { validateManualSubmission, upsertSubmission, markGraded } from "./manualSubmissions";

test("validateManualSubmission requires text or a file", () => {
  assert.equal(validateManualSubmission({ text: "", fileStorageKey: null }).ok, false);
  assert.equal(validateManualSubmission({ text: "   ", fileStorageKey: null }).error, "EMPTY_SUBMISSION");
  assert.equal(validateManualSubmission({ text: "answer" }).ok, true);
  assert.equal(validateManualSubmission({ fileStorageKey: "k" }).ok, true);
});

test("validateManualSubmission rejects oversized text", () => {
  const huge = "x".repeat(50_001);
  assert.equal(validateManualSubmission({ text: huge }).error, "TEXT_TOO_LONG");
});

async function withRepo<T>(fake: any, fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = () => fake;
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

test("upsertSubmission creates a new row when none exists", async () => {
  let created: any = null;
  const fake = {
    findOne: async () => null,
    create: (o: any) => o,
    save: async (o: any) => {
      created = o;
      return o;
    }
  };
  await withRepo(fake, () => upsertSubmission(7, 3, { text: "hi", fileStorageKey: null, fileName: null }));
  assert.equal(created.task.id, 7);
  assert.equal(created.student.id, 3);
  assert.equal(created.text, "hi");
  assert.equal(created.status, "SUBMITTED");
});

test("upsertSubmission overwrites an existing submission and resets status", async () => {
  const existing: any = { text: "old", status: "GRADED", fileStorageKey: "oldkey", fileName: "old.pdf" };
  const fake = {
    findOne: async () => existing,
    create: (o: any) => o,
    save: async (o: any) => o
  };
  await withRepo(fake, () => upsertSubmission(7, 3, { text: "new", fileStorageKey: "newkey", fileName: "n.pdf" }));
  assert.equal(existing.text, "new");
  assert.equal(existing.fileStorageKey, "newkey");
  assert.equal(existing.status, "SUBMITTED", "resubmit reopens for grading");
});

test("markGraded flips status to GRADED when a submission exists", async () => {
  const existing: any = { status: "SUBMITTED" };
  const fake = { findOne: async () => existing, save: async (o: any) => o };
  await withRepo(fake, () => markGraded(7, 3));
  assert.equal(existing.status, "GRADED");
});
