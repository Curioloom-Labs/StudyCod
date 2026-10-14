import crypto from "crypto";
import { In, LessThanOrEqual, type EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { EduCredentialOperation, type CredentialOperationKind } from "../../entities/EduCredentialOperation";
import { authorizeClassAction } from "./classAccess";
import { credentialRequestHash, encryptCredentialResponse, decryptCredentialResponse } from "./credentialOperationCrypto";
import { logger } from "../../utils/logger";

export interface CredentialRow { id: number; firstName: string; lastName: string; middleName: string; email: string; username: string; password: string }
export interface CredentialActor { userId: number; isSystemAdmin?: boolean }
export interface CredentialOperationOptions { key: string; kind: CredentialOperationKind; replayed?: boolean }
export interface CredentialOperationHandle { id: number; actor: CredentialActor; classId: number; options: CredentialOperationOptions }
interface CachedResponse { credentials: CredentialRow[]; versions: Record<string, string> }
export const CREDENTIAL_RECOVERY_TTL_MS = 30 * 60 * 1000;
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };
export function validCredentialOperationKey(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
const context = (row: EduCredentialOperation) => JSON.stringify([row.actorId, row.classId, row.operationKey, row.kind, row.requestHash]);
const fingerprint = (student: Student) => crypto.createHash("sha256").update(JSON.stringify([student.id, student.class.id, student.generatedUsername, student.generatedPassword,
  student.userAccountManaged ? [student.user?.id, student.user?.password] : null])).digest("hex");
const summary = (row: EduCredentialOperation) => ({ operationKey: row.operationKey, kind: row.kind, state: row.state, count: row.requestedCount, studentIds: row.studentIds, createdAt: row.createdAt, expiresAt: row.expiresAt });
const versionSelect = { id: true, generatedUsername: true, generatedPassword: true, userAccountManaged: true, class: { id: true }, user: { id: true, password: true } } as const;

export async function lockCredentialClass(manager: EntityManager, actor: CredentialActor, classId: number) {
  const cls = await manager.getRepository(Class).findOne({ where: { id: classId }, lock: { mode: "pessimistic_write" } });
  if (!cls) return fail("CLASS_NOT_FOUND", 404);
  if (!(await authorizeClassAction(actor.userId, classId, "STUDENT_MANAGE", { manager, isSystemAdmin: actor.isSystemAdmin }))?.allowed) return fail("FORBIDDEN", 403);
  return cls;
}
async function expired(manager: EntityManager, row: EduCredentialOperation) {
  const state = row.state === "PENDING" ? "CANCELLED" : "EXPIRED";
  await manager.getRepository(EduCredentialOperation).update(row.id, { state, responseCipher: null }); row.state = state; row.responseCipher = null;
}
async function readCached(manager: EntityManager, row: EduCredentialOperation): Promise<CredentialRow[]> {
  if (row.state === "ACKNOWLEDGED") return fail("CREDENTIAL_OPERATION_ACKNOWLEDGED", 410);
  if (row.state === "CANCELLED") return fail("CREDENTIAL_OPERATION_CANCELLED");
  if (row.state === "EXPIRED" || row.expiresAt.getTime() <= Date.now() || !row.responseCipher) return fail("CREDENTIAL_RECOVERY_EXPIRED", 410);
  let cached: CachedResponse;
  try { cached = decryptCredentialResponse<CachedResponse>(row.responseCipher, context(row)); } catch { return fail("CREDENTIAL_RECOVERY_UNAVAILABLE", 410); }
  const students = row.studentIds.length ? await manager.getRepository(Student).find({ select: versionSelect, where: { id: In(row.studentIds), class: { id: row.classId } }, relations: ["class", "user"] }) : [];
  const map = new Map(students.map(student => [student.id, student]));
  if (cached.credentials.length !== row.studentIds.length || row.studentIds.some(id => !map.has(id) || cached.versions[id] !== fingerprint(map.get(id)!))) return fail("CREDENTIAL_RECOVERY_STALE", 410);
  return cached.credentials;
}

/** The reservation commits before hashing; a cancelled/crashed request cannot later create duplicate students. */
export async function beginCredentialOperation(actor: CredentialActor, classId: number, options: CredentialOperationOptions, payload: unknown, count: number): Promise<{ handle: CredentialOperationHandle; credentials?: CredentialRow[] }> {
  if (!validCredentialOperationKey(options.key)) return fail("INVALID_OPERATION_KEY", 400);
  options.key = options.key.toLowerCase();
  const requestHash = credentialRequestHash({ kind: options.kind, payload });
  try {
    return await AppDataSource.transaction("READ COMMITTED", async manager => {
      await lockCredentialClass(manager, actor, classId);
      const repo = manager.getRepository(EduCredentialOperation);
      let row = await repo.findOne({ where: { actorId: actor.userId, operationKey: options.key }, lock: { mode: "pessimistic_write" } });
      if (row) {
        if (row.classId !== classId) return fail("CREDENTIAL_OPERATION_CONFLICT");
        if (row.state === "CANCELLED") return fail("CREDENTIAL_OPERATION_CANCELLED");
        if (row.kind !== options.kind || row.requestHash !== requestHash) return fail("CREDENTIAL_OPERATION_CONFLICT");
        const handle = { id: row.id, actor, classId, options };
        if (row.state !== "PENDING") { options.replayed = true; return { handle, credentials: await readCached(manager, row) }; }
        if (row.expiresAt.getTime() <= Date.now()) return fail("CREDENTIAL_RECOVERY_EXPIRED", 410);
        return { handle };
      }
      row = await repo.save(repo.create({ actorId: actor.userId, classId, operationKey: options.key, kind: options.kind, state: "PENDING", requestHash, requestedCount: count, studentIds: [], responseCipher: null, expiresAt: new Date(Date.now() + CREDENTIAL_RECOVERY_TTL_MS) }));
      return { handle: { id: row.id, actor, classId, options } };
    });
  } catch (error) { if ((error as { code?: string }).code === "ER_DUP_ENTRY") return fail("CREDENTIAL_OPERATION_CONFLICT"); throw error; }
}
export async function recheckCredentialOperation(manager: EntityManager, handle?: CredentialOperationHandle): Promise<CredentialRow[] | undefined> {
  if (!handle) return;
  const row = await manager.getRepository(EduCredentialOperation).findOne({ where: { id: handle.id, actorId: handle.actor.userId, classId: handle.classId }, lock: { mode: "pessimistic_write" } });
  if (!row) return fail("CREDENTIAL_OPERATION_NOT_FOUND", 404);
  if (row.state !== "PENDING") { handle.options.replayed = true; return readCached(manager, row); }
  if (row.expiresAt.getTime() <= Date.now()) return fail("CREDENTIAL_RECOVERY_EXPIRED", 410);
}
export async function completeCredentialOperation(manager: EntityManager, handle: CredentialOperationHandle | undefined, credentials: CredentialRow[]): Promise<void> {
  if (!handle) return;
  const row = await manager.getRepository(EduCredentialOperation).findOneByOrFail({ id: handle.id });
  const ids = credentials.map(item => item.id), students = ids.length ? await manager.getRepository(Student).find({ select: versionSelect, where: { id: In(ids), class: { id: handle.classId } }, relations: ["class", "user"] }) : [];
  if (students.length !== ids.length) return fail("CREDENTIAL_RECOVERY_STALE", 410);
  const versions = Object.fromEntries(students.map(student => [student.id, fingerprint(student)]));
  await manager.getRepository(EduCredentialOperation).update(row.id, { state: "READY", studentIds: ids, responseCipher: encryptCredentialResponse({ credentials, versions }, context(row)), expiresAt: new Date(Date.now() + CREDENTIAL_RECOVERY_TTL_MS) });
}
export async function abandonCredentialOperation(handle?: CredentialOperationHandle) {
  if (!handle) return;
  try { await AppDataSource.getRepository(EduCredentialOperation).update({ id: handle.id, state: "PENDING" }, { state: "CANCELLED", responseCipher: null }); }
  catch { logger.warn("[edu/credentials] unfinished operation retained", { operationId: handle.id }); }
}

export async function getCredentialOperation(actor: CredentialActor, classId: number, key: string) {
  if (!validCredentialOperationKey(key)) return fail("INVALID_OPERATION_KEY", 400);
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    await lockCredentialClass(manager, actor, classId);
    const row = await manager.getRepository(EduCredentialOperation).findOne({ where: { actorId: actor.userId, classId, operationKey: key.toLowerCase() }, lock: { mode: "pessimistic_write" } });
    if (!row) return { operationKey: key, state: "NOT_FOUND" as const };
    if ((row.state === "READY" || row.state === "PENDING") && row.expiresAt.getTime() <= Date.now()) await expired(manager, row);
    if (row.state === "READY") {
      try { return { ...summary(row), credentials: await readCached(manager, row) }; }
      catch (error) { if ((error as { statusCode?: number }).statusCode !== 410) throw error; await expired(manager, row); }
    }
    const eligible = row.studentIds.length ? await manager.getRepository(Student).find({ select: { id: true }, where: { id: In(row.studentIds), class: { id: classId } } }) : [];
    return { ...summary(row), eligibleStudentIds: eligible.map(student => student.id) };
  });
}
export async function listCredentialOperations(actor: CredentialActor, classId: number) {
  if (!(await authorizeClassAction(actor.userId, classId, "STUDENT_MANAGE", { isSystemAdmin: actor.isSystemAdmin }))?.allowed) return fail("FORBIDDEN", 403);
  const rows = await AppDataSource.getRepository(EduCredentialOperation).find({ select: { id: true, operationKey: true, kind: true, state: true, requestedCount: true, studentIds: true, createdAt: true, expiresAt: true }, where: { actorId: actor.userId, classId, state: In(["PENDING", "READY", "EXPIRED"]) }, order: { id: "DESC" }, take: 20 });
  return rows.map(row => ({ ...summary(row), state: row.expiresAt.getTime() <= Date.now() && row.state === "READY" ? "EXPIRED" : row.state }));
}
export async function closeCredentialOperation(actor: CredentialActor, classId: number, key: string, mode: "ACK" | "CANCEL", kind: CredentialOperationKind) {
  if (!validCredentialOperationKey(key)) return fail("INVALID_OPERATION_KEY", 400);
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    await lockCredentialClass(manager, actor, classId);
    const repo = manager.getRepository(EduCredentialOperation);
    let row = await repo.findOne({ where: { actorId: actor.userId, operationKey: key.toLowerCase() }, lock: { mode: "pessimistic_write" } });
    if (row && row.classId !== classId) return fail("CREDENTIAL_OPERATION_NOT_FOUND", 404);
    if (row && mode === "CANCEL" && (row.state === "READY" || row.state === "EXPIRED" || row.state === "ACKNOWLEDGED")) return fail("CREDENTIAL_OPERATION_ALREADY_COMPLETED");
    if (row && mode === "ACK" && row.state === "PENDING") return fail("CREDENTIAL_OPERATION_PENDING");
    if (!row) row = await repo.save(repo.create({ actorId: actor.userId, classId, operationKey: key.toLowerCase(), kind, state: "CANCELLED", requestHash: "", requestedCount: 0, studentIds: [], responseCipher: null, expiresAt: new Date() }));
    await repo.update(row.id, { state: mode === "ACK" ? "ACKNOWLEDGED" : "CANCELLED", responseCipher: null });
    return { operationKey: row.operationKey, state: mode === "ACK" ? "ACKNOWLEDGED" : "CANCELLED" };
  });
}
export async function expireCredentialOperations() {
  const repo = AppDataSource.getRepository(EduCredentialOperation), cutoff = new Date();
  await repo.update({ state: "READY", expiresAt: LessThanOrEqual(cutoff) }, { state: "EXPIRED", responseCipher: null });
  await repo.update({ state: "PENDING", expiresAt: LessThanOrEqual(cutoff) }, { state: "CANCELLED", responseCipher: null });
}
let cleanupTimer: NodeJS.Timeout | undefined;
export function startCredentialRecoveryCleanup() {
  if (cleanupTimer) return;
  const sweep = () => { if (AppDataSource.isInitialized) void expireCredentialOperations().catch(() => logger.warn("[edu/credentials] expiry sweep failed")); };
  sweep(); cleanupTimer = setInterval(sweep, 5 * 60 * 1000); cleanupTimer.unref();
}
