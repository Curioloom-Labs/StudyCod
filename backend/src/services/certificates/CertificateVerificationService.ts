import { AppDataSource } from "../../data-source";

export class CertificateVerificationService {
  async getByCertificateId(certificateId: string): Promise<null | {
    certificateId: string;
    name: string;
    contestName: string;
    date: string | null;
    score: number;
    maxScore: number;
    organizer: string;
    status: "valid" | "revoked";
  }> {
    const rows = (await AppDataSource.query(
      `
      SELECT c.certificate_id as certificateId,
             c.participant_name as participantName,
             c.issued_at as issuedAt,
             c.score as score,
             c.max_score as maxScore,
             c.organizer_name as organizerName,
             c.revoked_at as revokedAt,
             ct.title as contestTitle
      FROM certificates c
      JOIN contests ct ON ct.id = c.contest_id
      WHERE c.certificate_id = ?
      LIMIT 1
      `,
      [certificateId]
    )) as Array<any>;

    const row = rows[0];
    if (!row) return null;

    return {
      certificateId: String(row.certificateId),
      name: String(row.participantName ?? ""),
      contestName: String(row.contestTitle ?? ""),
      date: row.issuedAt ? new Date(row.issuedAt).toISOString() : null,
      score: Number(row.score ?? 0) || 0,
      maxScore: Number(row.maxScore ?? 0) || 0,
      organizer: String(row.organizerName ?? "StudyCod"),
      status: row.revokedAt ? "revoked" : "valid",
    };
  }
}
