import { EntityManager } from "typeorm";

function normalizeStudentIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];

  const unique = new Set<number>();
  for (const value of raw) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    const id = Math.floor(parsed);
    if (id > 0) unique.add(id);
  }

  return [...unique].sort((a, b) => a - b);
}

async function replaceRows(
  manager: EntityManager,
  options: {
    tableName: "topic_task_assignments" | "control_work_assignments";
    targetColumn: "topic_task_id" | "control_work_id";
    targetId: number;
    studentIds: number[];
  }
): Promise<void> {
  const targetId = Math.floor(Number(options.targetId));
  if (!Number.isFinite(targetId) || targetId <= 0) return;

  await manager.query(
    `DELETE FROM \`${options.tableName}\` WHERE \`${options.targetColumn}\` = ?`,
    [targetId]
  );

  if (options.studentIds.length === 0) return;

  const placeholders: string[] = [];
  const params: number[] = [];
  for (const studentId of options.studentIds) {
    placeholders.push("(?, ?)");
    params.push(targetId, studentId);
  }

  await manager.query(
    `INSERT INTO \`${options.tableName}\` (\`${options.targetColumn}\`, \`student_id\`) VALUES ${placeholders.join(", ")}`,
    params
  );
}

export async function syncTopicTaskAssignmentsWithManager(
  manager: EntityManager,
  options: {
    topicTaskId: number;
    isAssigned: boolean;
    assignedStudentIds: number[];
  }
): Promise<void> {
  const normalizedStudentIds = options.isAssigned
    ? normalizeStudentIds(options.assignedStudentIds)
    : [];

  await replaceRows(manager, {
    tableName: "topic_task_assignments",
    targetColumn: "topic_task_id",
    targetId: options.topicTaskId,
    studentIds: normalizedStudentIds,
  });
}

export async function syncControlWorkAssignmentsWithManager(
  manager: EntityManager,
  options: {
    controlWorkId: number;
    isAssigned: boolean;
    assignedStudentIds: number[];
  }
): Promise<void> {
  const normalizedStudentIds = options.isAssigned
    ? normalizeStudentIds(options.assignedStudentIds)
    : [];

  await replaceRows(manager, {
    tableName: "control_work_assignments",
    targetColumn: "control_work_id",
    targetId: options.controlWorkId,
    studentIds: normalizedStudentIds,
  });
}
