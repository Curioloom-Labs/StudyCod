import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `classes.org_id` and backfills existing single-tenant data into the SaaS
 * model: each teacher who owns classes becomes the ORG_ADMIN of their own new
 * organization, and their classes are attached to it.
 *
 * Idempotent: re-running reuses a teacher's existing ORG_ADMIN org (or an org
 * with the same deterministic slug) and only fills classes whose org_id is null.
 * Touches data, so verify on a copy (`npm run db:migrate`) before production.
 */
function slugify(raw: string): string {
  const base = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "org";
}

export class AddClassOrgAndBackfill1749200000000 implements MigrationInterface {
  name = "AddClassOrgAndBackfill1749200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const classTables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(classTables) || classTables.length === 0) return;

    // 1. Add the nullable org_id column + FK (idempotent).
    const orgCol = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'org_id'");
    if (!Array.isArray(orgCol) || orgCol.length === 0) {
      await queryRunner.query("ALTER TABLE `classes` ADD COLUMN `org_id` INT NULL AFTER `teacher_id`");
      await queryRunner.query(
        "ALTER TABLE `classes` ADD CONSTRAINT `fk_class_org` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL"
      );
    }

    // 2. Backfill one org per teacher who owns classes not yet attached.
    const teachers: Array<{ teacher_id: number }> = await queryRunner.query(
      "SELECT DISTINCT teacher_id FROM `classes` WHERE teacher_id IS NOT NULL AND org_id IS NULL"
    );

    for (const { teacher_id } of teachers) {
      // Reuse an existing ORG_ADMIN org for this teacher if present.
      const existingMembership = await queryRunner.query(
        "SELECT org_id FROM `memberships` WHERE user_id = ? AND role = 'ORG_ADMIN' LIMIT 1",
        [teacher_id]
      );
      let orgId: number | null =
        Array.isArray(existingMembership) && existingMembership.length > 0
          ? Number(existingMembership[0].org_id)
          : null;

      if (!orgId) {
        const userRows = await queryRunner.query(
          "SELECT username, first_name, last_name FROM `users` WHERE id = ? LIMIT 1",
          [teacher_id]
        );
        const u = Array.isArray(userRows) && userRows.length > 0 ? userRows[0] : null;
        const displayName =
          [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
          (u?.username ? String(u.username) : `Teacher ${teacher_id}`);
        const slug = `${slugify(u?.username || displayName)}-t${teacher_id}`;

        // Reuse an org with the same deterministic slug (covers a partial prior run).
        const existingOrg = await queryRunner.query("SELECT id FROM `organizations` WHERE slug = ? LIMIT 1", [slug]);
        if (Array.isArray(existingOrg) && existingOrg.length > 0) {
          orgId = Number(existingOrg[0].id);
        } else {
          const insertOrg = await queryRunner.query(
            "INSERT INTO `organizations` (name, slug) VALUES (?, ?)",
            [displayName, slug]
          );
          orgId = Number(insertOrg.insertId);
        }

        // Ensure ORG_ADMIN membership exists.
        const hasMembership = await queryRunner.query(
          "SELECT id FROM `memberships` WHERE user_id = ? AND org_id = ? LIMIT 1",
          [teacher_id, orgId]
        );
        if (!Array.isArray(hasMembership) || hasMembership.length === 0) {
          await queryRunner.query(
            "INSERT INTO `memberships` (user_id, org_id, role) VALUES (?, ?, 'ORG_ADMIN')",
            [teacher_id, orgId]
          );
        }
      }

      await queryRunner.query("UPDATE `classes` SET org_id = ? WHERE teacher_id = ? AND org_id IS NULL", [
        orgId,
        teacher_id
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const classTables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(classTables) || classTables.length === 0) return;

    // Drop the FK (name may vary if created elsewhere; guard via information_schema).
    const fk = await queryRunner.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'org_id' AND REFERENCED_TABLE_NAME = 'organizations'"
    );
    if (Array.isArray(fk)) {
      for (const row of fk) {
        await queryRunner.query(`ALTER TABLE \`classes\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      }
    }

    const orgCol = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'org_id'");
    if (Array.isArray(orgCol) && orgCol.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP COLUMN `org_id`");
    }
    // Orgs/memberships tables themselves are dropped by the prior migration's down().
  }
}
