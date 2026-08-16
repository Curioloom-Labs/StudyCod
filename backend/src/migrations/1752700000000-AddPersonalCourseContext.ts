import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Makes the Personal course context explicit. Existing progress is preserved:
 * the user pointer selects the current workspace, while task links replace the
 * old CATALOG_ITEM:<id>|... subtitle convention.
 */
export class AddPersonalCourseContext1752700000000 implements MigrationInterface {
  name = "AddPersonalCourseContext1752700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = async (table: string, column: string): Promise<boolean> => {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    };
    const hasIndex = async (table: string, index: string): Promise<boolean> => {
      const rows = await queryRunner.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [index]);
      return Array.isArray(rows) && rows.length > 0;
    };

    if (!(await hasColumn("users", "current_course_enrollment_id"))) {
      await queryRunner.query("ALTER TABLE `users` ADD COLUMN `current_course_enrollment_id` INT NULL AFTER `user_mode`");
    }
    if (!(await hasIndex("users", "idx_users_current_course"))) {
      await queryRunner.query("ALTER TABLE `users` ADD INDEX `idx_users_current_course` (`current_course_enrollment_id`)");
    }

    if (!(await hasColumn("tasks", "course_item_id"))) {
      await queryRunner.query("ALTER TABLE `tasks` ADD COLUMN `course_item_id` INT NULL AFTER `topic_id`");
    }
    if (!(await hasColumn("tasks", "course_enrollment_id"))) {
      await queryRunner.query("ALTER TABLE `tasks` ADD COLUMN `course_enrollment_id` INT NULL AFTER `course_item_id`");
    }
    if (!(await hasIndex("tasks", "idx_tasks_course_item"))) {
      await queryRunner.query("ALTER TABLE `tasks` ADD INDEX `idx_tasks_course_item` (`course_item_id`, `course_enrollment_id`)");
    }

    // Existing users keep the most recently changed Personal enrollment as the
    // initial workspace. This is deterministic and safe to run once only.
    const users = await queryRunner.query("SELECT id FROM `users`") as Array<{ id: number }>;
    for (const user of users) {
      const current = await queryRunner.query(
        `SELECT id FROM user_course_enrollments
          WHERE user_id = ? AND status = 'IN_PROGRESS'
          ORDER BY updated_at DESC, id DESC LIMIT 1`,
        [user.id],
      ) as Array<{ id: number }>;
      if (current[0]?.id) {
        await queryRunner.query(
          "UPDATE `users` SET `current_course_enrollment_id` = ? WHERE `id` = ? AND `current_course_enrollment_id` IS NULL",
          [current[0].id, user.id],
        );
      }
    }

    // Backfill generated course tasks. Keep the subtitle until the application
    // cutover is verified; it remains a harmless legacy display value.
    const legacyTasks = await queryRunner.query(
      `SELECT id, user_id AS userId, CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(subtitle, '|', 1), ':', -1) AS UNSIGNED) AS itemId
         FROM tasks
        WHERE subtitle LIKE 'CATALOG_ITEM:%' AND (course_item_id IS NULL OR course_enrollment_id IS NULL)`,
    ) as Array<{ id: number; userId: number; itemId: number }>;
    for (const task of legacyTasks) {
      if (!task.itemId) continue;
      const item = await queryRunner.query(
        `SELECT i.id, m.course_id AS courseId
           FROM course_items i INNER JOIN course_modules m ON m.id = i.module_id
          WHERE i.id = ? LIMIT 1`,
        [task.itemId],
      ) as Array<{ id: number; courseId: number }>;
      if (!item[0]) continue;
      const enrollment = await queryRunner.query(
        `SELECT id FROM user_course_enrollments
          WHERE user_id = ? AND course_id = ?
          ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'COMPLETED' THEN 1 ELSE 2 END, updated_at DESC, id DESC
          LIMIT 1`,
        [task.userId, item[0].courseId],
      ) as Array<{ id: number }>;
      if (!enrollment[0]) continue;
      await queryRunner.query(
        "UPDATE `tasks` SET `course_item_id` = ?, `course_enrollment_id` = ? WHERE `id` = ?",
        [item[0].id, enrollment[0].id, task.id],
      );
    }

    const userFk = await queryRunner.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'current_course_enrollment_id' AND REFERENCED_TABLE_NAME = 'user_course_enrollments'") as Array<{ CONSTRAINT_NAME: string }>;
    if (!userFk[0]) {
      await queryRunner.query("ALTER TABLE `users` ADD CONSTRAINT `fk_users_current_course` FOREIGN KEY (`current_course_enrollment_id`) REFERENCES `user_course_enrollments` (`id`) ON DELETE SET NULL");
    }
    const taskItemFk = await queryRunner.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'course_item_id' AND REFERENCED_TABLE_NAME = 'course_items'") as Array<{ CONSTRAINT_NAME: string }>;
    if (!taskItemFk[0]) {
      await queryRunner.query("ALTER TABLE `tasks` ADD CONSTRAINT `fk_tasks_course_item` FOREIGN KEY (`course_item_id`) REFERENCES `course_items` (`id`) ON DELETE SET NULL");
    }
    const taskEnrollmentFk = await queryRunner.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'course_enrollment_id' AND REFERENCED_TABLE_NAME = 'user_course_enrollments'") as Array<{ CONSTRAINT_NAME: string }>;
    if (!taskEnrollmentFk[0]) {
      await queryRunner.query("ALTER TABLE `tasks` ADD CONSTRAINT `fk_tasks_course_enrollment` FOREIGN KEY (`course_enrollment_id`) REFERENCES `user_course_enrollments` (`id`) ON DELETE SET NULL");
    }

    // Convert the old flat Personal module into native topic sections. EDU
    // course forks are organization-scoped and intentionally excluded.
    const globalCourses = await queryRunner.query(
      "SELECT id, catalog_key AS catalogKey FROM `courses` WHERE org_id IS NULL AND catalog_key IS NOT NULL",
    ) as Array<{ id: number; catalogKey: string }>;
    for (const course of globalCourses) {
      const items = await queryRunner.query(
        `SELECT i.id, i.module_id AS moduleId, i.content_key AS contentKey, i.title, i.order
           FROM course_items i INNER JOIN course_modules m ON m.id = i.module_id
          WHERE m.course_id = ? AND i.content_key IS NOT NULL
          ORDER BY i.order ASC, i.id ASC`,
        [course.id],
      ) as Array<{ id: number; moduleId: number; contentKey: string; title: string; order: number }>;
      const groups = new Map<string, { title: string; order: number; items: typeof items }>();
      for (const item of items) {
        const prefix = `${course.catalogKey}.`;
        if (!item.contentKey.startsWith(prefix)) continue;
        const rest = item.contentKey.slice(prefix.length);
        const isProject = rest.startsWith("project.") || rest === "final-assessment";
        const topicKey = isProject ? "projects" : rest.replace(/\.(?:theory|practice(?:-\d+)?)$/, "");
        if (!topicKey) continue;
        const moduleKey = isProject ? `${course.catalogKey}.projects` : `${course.catalogKey}.topic.${topicKey}`;
        const group = groups.get(moduleKey) || { title: isProject ? "Проєкти та фінальна робота" : item.title, order: item.order, items: [] };
        group.order = Math.min(group.order, item.order);
        group.items.push(item);
        groups.set(moduleKey, group);
      }
      const orderedGroups = [...groups.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
      for (const [moduleKey, group] of orderedGroups) {
        const existing = await queryRunner.query(
          "SELECT id FROM course_modules WHERE course_id = ? AND content_key = ? LIMIT 1",
          [course.id, moduleKey],
        ) as Array<{ id: number }>;
        let moduleId = existing[0]?.id;
        if (!moduleId) {
          const result = await queryRunner.query(
            "INSERT INTO course_modules (course_id, title, `order`, content_key, source_hash, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NOW(), NOW())",
            [course.id, group.title, orderedGroups.findIndex(([key]) => key === moduleKey), moduleKey],
          );
          moduleId = Number(result.insertId);
        } else {
          await queryRunner.query("UPDATE course_modules SET title = ?, `order` = ? WHERE id = ?", [group.title, orderedGroups.findIndex(([key]) => key === moduleKey), moduleId]);
        }
        group.items.sort((a, b) => a.order - b.order || a.id - b.id);
        for (const [index, item] of group.items.entries()) {
          await queryRunner.query("UPDATE course_items SET module_id = ?, `order` = ? WHERE id = ?", [moduleId, index, item.id]);
        }
      }
      const finalKey = `${course.catalogKey}.final-assessment`;
      const existingFinal = await queryRunner.query("SELECT id FROM course_items WHERE content_key = ? LIMIT 1", [finalKey]) as Array<{ id: number }>;
      if (!existingFinal[0]) {
        const projectModuleKey = `${course.catalogKey}.projects`;
        const projectModule = await queryRunner.query("SELECT id FROM course_modules WHERE course_id = ? AND content_key = ? LIMIT 1", [course.id, projectModuleKey]) as Array<{ id: number }>;
        let projectModuleId = projectModule[0]?.id;
        if (!projectModuleId) {
          const result = await queryRunner.query(
            "INSERT INTO course_modules (course_id, title, `order`, content_key, source_hash, created_at, updated_at) VALUES (?, 'Проєкти та фінальна робота', ?, ?, NULL, NOW(), NOW())",
            [course.id, orderedGroups.length, projectModuleKey],
          );
          projectModuleId = Number(result.insertId);
        }
        const content = JSON.stringify({
          project: true,
          finalAssessment: true,
          projectKey: finalKey,
          markdown: "## Фінальна робота\n\nЗбери в одну завершену роботу навички цього курсу. Опиши рішення, покажи перевірку та відомі обмеження.",
          required: true,
          projectSpec: {
            version: 1,
            kind: "FINAL_ASSESSMENT",
            estimatedMinutes: 120,
            skills: ["integration", "documentation", "verification"],
            milestones: [
              { id: "scope", title: "Сформулювати задачу", description: "Опиши задачу, користувача та очікуваний результат." },
              { id: "implementation", title: "Реалізувати рішення", description: "Покажи основну реалізацію та ключові технічні рішення." },
              { id: "verification", title: "Перевірити результат", description: "Додай приклади перевірки, тестування або демонстрації." },
            ],
            acceptanceCriteria: ["Усі етапи виконані", "Є короткі нотатки реалізації", "README пояснює запуск і обмеження"],
            template: "# Фінальна робота\n\n## Рішення\n\n## Перевірка\n",
          },
        });
        await queryRunner.query(
          "INSERT INTO course_items (module_id, kind, title, `order`, content_key, source_hash, content_version, is_active, content, created_at, updated_at) VALUES (?, 'MANUAL', 'Фінальна робота курсу', 999, ?, NULL, 1, 1, ?, NOW(), NOW())",
          [projectModuleId, finalKey, content],
        );
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Forward-only: the backfilled links are the canonical source of truth.
  }
}
