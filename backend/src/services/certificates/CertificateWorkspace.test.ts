import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import type { AuthRequest } from "../../middleware/authMiddleware";
import { getCertificateWorkspace, previewCertificate, requireCertificateManager, retryFailedCertificateJobs, summarizeCertificateJobs, queueExistingCertificateEmails } from "./CertificateWorkspace";
import { certificateService } from "./CertificateService";
import { awardSourceVersion } from "../contest/awards";

test("certificate workspace grants co-organizers access and rejects unrelated accounts", async t => {
  t.mock.method(AppDataSource, "query", async () => [{ id: 7, ownerId: 1, isOrganizer: 1 }]);
  assert.equal((await requireCertificateManager({ userId: 2, userType: "USER" } as AuthRequest, 7)).id, 7);
  t.mock.method(AppDataSource, "query", async () => [{ id: 7, ownerId: 1, isOrganizer: 0 }]);
  await assert.rejects(requireCertificateManager({ userId: 2, userType: "USER" } as AuthRequest, 7), /ACCESS_DENIED/);
  await assert.rejects(requireCertificateManager({ userId: 1, userType: "STUDENT" } as AuthRequest, 7), /ACCESS_DENIED/);
});

test("workspace restores saved settings and reports completed PDFs alongside failed delivery", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM contest_certificate_settings")) return [{ mode: "custom", templateId: 31, sendEmailEnabled: 0 }];
    if (sql.includes("FROM certificate_templates")) return [{ id: 31, name: "Куб", type: "custom", contestId: 7, version: 2 }];
    if (sql.includes("FROM contest_participants")) return [{ participantId: 11, email: "test@example.com", certificateId: "SC-7-11", status: "rendered", storageKey: "uploads/certificates/7/test.pdf" }];
    if (sql.includes("SELECT id FROM certificate_job_queue")) return [{ id: 40 }];
    return [{ id: 41, queue: "pdf_render", status: "done", participantId: 11 }, { id: 42, queue: "email_send", status: "failed", participantId: 11, error: "SMTP_UNAVAILABLE" }];
  });
  const state = await getCertificateWorkspace(7, 1);
  assert.deepEqual(state.settings, { mode: "custom", templateId: 31, sendEmailEnabled: false });
  assert.equal(state.recipients[0].pdfAvailable, true);
  assert.equal(state.generation.status, "failed");
  assert.equal(state.generation.rendered, 1);
  assert.equal(state.generation.errors[0].stage, "email_send");
});

test("preview preserves embedded backgrounds and applies all four award variants without issuing a certificate", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => { if (/INSERT|UPDATE/.test(sql)) writes++; return []; });
  for (const place of [null, "1", "2", "3"] as const) {
    const { html } = await previewCertificate(7, { title: "Турнір", endsAt: "2026-10-22", organizerName: "Рубан Микита" }, {
      htmlTemplate: '<main class="rank-{{place}}">{{name}} · {{contest_name}}</main>',
      cssTemplate: '.background{background:url("data:image/webp;base64,AAAA")} .external{background:url("https://example.com/x.png")}', place,
    });
    assert.ok(html.includes(`rank-${place || ""}`));
    assert.ok(html.includes("data:image/webp;base64,AAAA"));
    assert.ok(!html.includes("https://example.com/x.png"));
  }
  assert.equal(writes, 0);
});

test("retry affects only failed jobs while in-flight work remains visible", async t => {
  let retried: unknown[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, args: unknown[]) => {
    if (sql.startsWith("UPDATE")) { retried = args; return {}; }
    if (sql.includes("SELECT id FROM")) return [{ id: 10 }];
    return [{ id: 11, queue: "pdf_render", status: "done" }, { id: 12, queue: "pdf_render", status: "failed" }, { id: 13, queue: "email_send", status: "processing" }];
  });
  assert.deepEqual(await retryFailedCertificateJobs(7), { retried: 1 });
  assert.deepEqual(retried, [12]);
  assert.equal(summarizeCertificateJobs([{ id: 1, queue: "pdf_render", status: "processing", participantId: 11, error: null }]).status, "running");
});

test("an active certificate queue prevents a second generation batch", async t => {
  let source = "";
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM contest_awards")
    ? [{ sourceVersion: source, confirmedAt: "2026-10-22", decisions: "[]" }] : []);
  source = await awardSourceVersion(7);
  t.mock.method(AppDataSource, "transaction", (async (work: any) => work({ query: async (sql: string) => {
    if (sql.includes("certificate_mode")) return [{ mode: "custom" }];
    if (sql.includes("status IN")) return [{ id: 42 }];
    writes++; return {};
  } })) as typeof AppDataSource.transaction);
  await assert.rejects(certificateService.enqueueContestGeneration({ contestId: 7, requestedByUserId: 1 }), /CERTIFICATE_GENERATION_IN_PROGRESS/);
  assert.equal(writes, 0);
});

test("emailing existing PDFs keeps their certificate IDs and excludes ineligible participants", async t => {
  let source = "";
  const decisions = [
    { participantId: 11, submissionCount: 1, isDisqualified: false, retainParticipation: false, awardPlace: 1 },
    { participantId: 12, submissionCount: 0, isDisqualified: false, retainParticipation: false, awardPlace: null },
    { participantId: 13, submissionCount: 1, isDisqualified: true, retainParticipation: false, awardPlace: null },
  ];
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM contest_awards")
    ? [{ sourceVersion: source, confirmedAt: "2026-10-22", decisions: JSON.stringify(decisions) }] : []);
  source = await awardSourceVersion(7);
  const inserted: Array<{ sql: string; args: unknown[] }> = [];
  t.mock.method(AppDataSource, "transaction", (async (work: any) => work({ query: async (sql: string, args: unknown[]) => {
    if (sql.includes("FROM certificates c")) return [11, 12, 13].map(participantId => ({ participantId, certificateId: `existing-${participantId}` }));
    if (sql.startsWith("INSERT")) { inserted.push({ sql, args }); return { insertId: 1 }; }
    return [];
  } })) as typeof AppDataSource.transaction);
  assert.deepEqual(await queueExistingCertificateEmails(7), { queued: 1 });
  const emails = inserted.filter(row => row.sql.includes("'email_send'"));
  assert.equal(emails.length, 1);
  assert.deepEqual(JSON.parse(String(emails[0].args[0])), { contestId: 7, participantId: 11, certificateId: "existing-11" });
  assert.ok(inserted.every(row => !row.sql.includes("pdf_render")));
});
