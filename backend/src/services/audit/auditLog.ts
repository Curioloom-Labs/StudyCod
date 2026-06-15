import { AppDataSource } from "../../data-source";
import { AuditLog, type AuditActorType } from "../../entities/AuditLog";
import { logger } from "../../utils/logger";

/**
 * Best-effort audit writer. The append-only trail behind the data-access journal
 * (COPPA/FERPA) and RBAC change log. By contract a failure here NEVER propagates:
 * recording an action must not be able to break the action itself.
 */
export interface AuditInput {
  actorType: AuditActorType;
  actorId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  orgId?: number | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  ip?: string | null;
}

const repo = () => AppDataSource.getRepository(AuditLog);

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const row = repo().create({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      orgId: input.orgId ?? null,
      metadata: input.metadata ?? null,
      requestId: input.requestId ?? null,
      ip: input.ip ?? null
    });
    await repo().save(row);
  } catch (err: unknown) {
    logger.warn("[audit] write failed", {
      action: input.action,
      message: err instanceof Error ? err.message : String(err)
    });
  }
}

export interface AuditQuery {
  targetType?: string;
  targetId?: number;
  actorType?: AuditActorType;
  actorId?: number;
  action?: string;
  limit?: number;
}

/**
 * Read the trail for a target/actor — e.g. "who accessed this student's data".
 * Newest first, hard-capped so a missing filter can't dump the whole table.
 */
export async function getAuditLogs(query: AuditQuery): Promise<AuditLog[]> {
  const qb = repo().createQueryBuilder("a").orderBy("a.created_at", "DESC");
  if (query.targetType) qb.andWhere("a.target_type = :tt", { tt: query.targetType });
  if (query.targetId != null) qb.andWhere("a.target_id = :ti", { ti: query.targetId });
  if (query.actorType) qb.andWhere("a.actor_type = :at", { at: query.actorType });
  if (query.actorId != null) qb.andWhere("a.actor_id = :ai", { ai: query.actorId });
  if (query.action) qb.andWhere("a.action = :ac", { ac: query.action });
  const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
  qb.limit(limit);
  return qb.getMany();
}
