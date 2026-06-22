import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { ControlWork } from "../../entities/ControlWork";

/**
 * Deadline agenda (Tier 1 calendar) — a derived view over existing deadlines
 * (`EduTask.deadline`, `ControlWork.deadline`). No schema change.
 */

export type AgendaBucket = "overdue" | "today" | "soon" | "later";

export interface AgendaItem {
  kind: "TASK" | "CONTROL";
  id: number;
  title: string;
  deadline: string; // ISO
  classId: number;
  className: string;
  lessonId?: number;
  topicId?: number;
}

export interface ClassifiedAgendaItem extends AgendaItem {
  deadlineMs: number;
  bucket: AgendaBucket;
}

const SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Pure: bucket + sort agenda items relative to `now`. Items with an unparseable
 * deadline are dropped. Sorted ascending by deadline (soonest first).
 */
export function classifyAgenda(items: AgendaItem[], now: Date): ClassifiedAgendaItem[] {
  const nowMs = now.getTime();
  const out: ClassifiedAgendaItem[] = [];
  for (const it of items) {
    const ms = new Date(it.deadline).getTime();
    if (!Number.isFinite(ms)) continue;
    let bucket: AgendaBucket;
    if (ms < nowMs) bucket = "overdue";
    else if (sameDay(new Date(ms), now)) bucket = "today";
    else if (ms <= nowMs + SOON_WINDOW_MS) bucket = "soon";
    else bucket = "later";
    out.push({ ...it, deadlineMs: ms, bucket });
  }
  out.sort((a, b) => a.deadlineMs - b.deadlineMs);
  return out;
}

/** Count items per bucket (for badges/summaries). Pure. */
export function summarizeAgenda(items: ClassifiedAgendaItem[]): Record<AgendaBucket, number> {
  const acc: Record<AgendaBucket, number> = { overdue: 0, today: 0, soon: 0, later: 0 };
  for (const it of items) acc[it.bucket] += 1;
  return acc;
}

const taskRepo = () => AppDataSource.getRepository(EduTask);
const controlRepo = () => AppDataSource.getRepository(ControlWork);

/**
 * Aggregate task + control-work deadlines for the given classes within a window.
 * Closed tasks are excluded. Returns raw (unclassified) items.
 */
export async function getDeadlinesForClasses(classIds: number[], from: Date, to: Date): Promise<AgendaItem[]> {
  if (!classIds.length) return [];

  const taskRows = await taskRepo()
    .createQueryBuilder("t")
    .innerJoin("t.lesson", "l")
    .innerJoin("l.class", "c")
    .where("c.id IN (:...ids)", { ids: classIds })
    .andWhere("t.deadline IS NOT NULL")
    .andWhere("t.isClosed = 0")
    .andWhere("t.deadline BETWEEN :from AND :to", { from, to })
    .select("t.id", "id")
    .addSelect("t.title", "title")
    .addSelect("t.deadline", "deadline")
    .addSelect("l.id", "lessonId")
    .addSelect("c.id", "classId")
    .addSelect("c.name", "className")
    .getRawMany();

  const controlRows = await controlRepo()
    .createQueryBuilder("w")
    .innerJoin("w.topic", "tp")
    .innerJoin("tp.class", "c")
    .where("c.id IN (:...ids)", { ids: classIds })
    .andWhere("w.deadline IS NOT NULL")
    .andWhere("w.deadline BETWEEN :from AND :to", { from, to })
    .select("w.id", "id")
    .addSelect("w.title", "title")
    .addSelect("w.deadline", "deadline")
    .addSelect("tp.id", "topicId")
    .addSelect("c.id", "classId")
    .addSelect("c.name", "className")
    .getRawMany();

  const items: AgendaItem[] = [];
  for (const r of taskRows) {
    items.push({
      kind: "TASK",
      id: Number(r.id),
      title: String(r.title ?? "Task"),
      deadline: new Date(r.deadline).toISOString(),
      classId: Number(r.classId),
      className: String(r.className ?? ""),
      lessonId: Number(r.lessonId)
    });
  }
  for (const r of controlRows) {
    items.push({
      kind: "CONTROL",
      id: Number(r.id),
      title: String(r.title ?? "Control work"),
      deadline: new Date(r.deadline).toISOString(),
      classId: Number(r.classId),
      className: String(r.className ?? ""),
      topicId: Number(r.topicId)
    });
  }
  return items;
}
