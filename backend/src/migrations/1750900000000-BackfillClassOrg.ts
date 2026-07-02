import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase-1 multitenancy backfill: every `classes` row must belong to an
 * organization so org-scoped EDU authorization (memberships → roles) applies to
 * pre-multitenancy classes, not just newly created ones.
 *
 * For each class with `org_id IS NULL`, attach it to its owning teacher's org:
 *  - if the teacher already has an ORG_ADMIN/TEACHER membership, use that org
 *    (deterministic: the lowest org_id);
 *  - otherwise create a personal organization for that teacher + an ORG_ADMIN
 *    membership (the retroactive equivalent of self-signup), and use it.
 *
 * Idempotent (only touches `org_id IS NULL` rows) and data-only — no schema
 * change, so `org_id` stays nullable here; flipping it to NOT NULL is a later
 * migration once this has run everywhere.
 *
 * ⚠ Validated read-only against prod (1 orphan class whose teacher already has an
 * org) but the create-org branch was NOT exercised on a live DB — run
 * `npm run db:migrate` on a copy first if any teacher lacks a membership.
 */
export class BackfillClassOrg1750900000000 implements MigrationInterface {
  name = "BackfillClassOrg1750900000000";

  /** Mirror of services/edu/membership.ts slugifyBase, inlined so the migration is self-contained. */
  private slugifyBase(name: string): string {
    const base = String(name ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return base || "org";
  }

  private async uniqueSlug(q: QueryRunner, name: string): Promise<string> {
    const base = this.slugifyBase(name);
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(16).slice(2, 8)}`;
      const rows = await q.query("SELECT `id` FROM `organizations` WHERE `slug` = ? LIMIT 1", [candidate]);
      if (!Array.isArray(rows) || rows.length === 0) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /** The org a teacher's classes should join — existing teaching membership, else a new personal org. */
  private async resolveOrCreateTeacherOrg(q: QueryRunner, teacherId: number): Promise<number | null> {
    const existing = await q.query(
      "SELECT `org_id` FROM `memberships` WHERE `user_id` = ? AND `role` IN ('ORG_ADMIN','TEACHER') ORDER BY `org_id` ASC LIMIT 1",
      [teacherId]
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return Number(existing[0].org_id);
    }

    const userRows = await q.query("SELECT `username` FROM `users` WHERE `id` = ? LIMIT 1", [teacherId]);
    if (!Array.isArray(userRows) || userRows.length === 0) return null;
    const username = String(userRows[0].username || "teacher").slice(0, 200) || "teacher";
    const slug = await this.uniqueSlug(q, username);

    const insertOrg = await q.query(
      "INSERT INTO `organizations` (`name`, `slug`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW())",
      [username, slug]
    );
    const orgId = Number(insertOrg.insertId);
    await q.query(
      "INSERT INTO `memberships` (`user_id`, `org_id`, `role`, `created_at`, `updated_at`) VALUES (?, ?, 'ORG_ADMIN', NOW(), NOW())",
      [teacherId, orgId]
    );
    return orgId;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphans: Array<{ id: number; teacher_id: number }> = await queryRunner.query(
      "SELECT `id`, `teacher_id` FROM `classes` WHERE `org_id` IS NULL"
    );
    if (!Array.isArray(orphans) || orphans.length === 0) return;

    const orgByTeacher = new Map<number, number>();
    for (const cls of orphans) {
      const teacherId = Number(cls.teacher_id);
      if (!Number.isFinite(teacherId)) continue;

      let orgId = orgByTeacher.get(teacherId);
      if (orgId == null) {
        const resolved = await this.resolveOrCreateTeacherOrg(queryRunner, teacherId);
        if (resolved == null) continue; // orphaned teacher row; leave the class for manual review
        orgId = resolved;
        orgByTeacher.set(teacherId, orgId);
      }
      await queryRunner.query(
        "UPDATE `classes` SET `org_id` = ? WHERE `id` = ? AND `org_id` IS NULL",
        [orgId, cls.id]
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally irreversible: a backfill cannot tell apart orgs/memberships
    // it created from ones created legitimately afterwards, so reversing would
    // risk deleting live tenant data. Re-running up() is safe (idempotent).
  }
}
