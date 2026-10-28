import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { CertificateVerificationService } from "./CertificateVerificationService";

const certificateRow = (overrides: Record<string, unknown> = {}) => ({
  certificateId: "SC-7-12-abcd1234",
  participantName: "Candidate",
  issuedAt: "2026-10-20T12:00:00.000Z",
  score: 90,
  maxScore: 100,
  organizerName: "StudyCod",
  certificateStatus: "rendered",
  revokedAt: null,
  contestTitle: "Autumn contest",
  ...overrides,
});

test("public certificate verification only treats rendered and emailed rows as issued", async t => {
  let row: Record<string, unknown> | null = certificateRow();
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    assert.match(sql, /c\.status as certificateStatus/);
    return row ? [row] : [];
  });

  const service = new CertificateVerificationService();
  assert.equal((await service.getByCertificateId("SC-7-12-abcd1234"))?.status, "valid");
  row = certificateRow({ certificateStatus: "emailed" });
  assert.equal((await service.getByCertificateId("SC-7-12-abcd1234"))?.status, "valid");
  row = certificateRow({ certificateStatus: "queued" });
  assert.equal(await service.getByCertificateId("SC-7-12-abcd1234"), null);
  row = certificateRow({ certificateStatus: "failed" });
  assert.equal(await service.getByCertificateId("SC-7-12-abcd1234"), null);
  row = certificateRow({ issuedAt: null });
  assert.equal(await service.getByCertificateId("SC-7-12-abcd1234"), null);
});

test("revoked certificates remain identifiable but are never reported as valid", async t => {
  let row: Record<string, unknown> = certificateRow({ certificateStatus: "revoked" });
  t.mock.method(AppDataSource, "query", async () => [row]);

  const service = new CertificateVerificationService();
  assert.equal((await service.getByCertificateId("SC-7-12-abcd1234"))?.status, "revoked");
  row = certificateRow({ revokedAt: "2026-10-21T12:00:00.000Z" });
  assert.equal((await service.getByCertificateId("SC-7-12-abcd1234"))?.status, "revoked");
});
