import type { EntityManager } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Class } from "../../entities/Class";
import { Membership } from "../../entities/Membership";
import { generatePassword, generateUsername, hashPassword } from "../studentCredentialsService";
import { authorizeClassAction } from "./classAccess";
import { beginCredentialOperation, recheckCredentialOperation, completeCredentialOperation, abandonCredentialOperation, type CredentialOperationOptions, type CredentialRow } from "./credentialOperations";

export const studentInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(), email: z.string().trim().toLowerCase().max(255).email().optional().or(z.literal("")),
}).strict();
export const importedStudentSchema = studentInputSchema.extend({
  username: z.string().trim().max(100).regex(/^[a-zA-Z0-9_.-]*$/).optional(),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72 && !/[\x00-\x1f\x7f]/.test(value)).optional(),
});
export type StudentInput = z.infer<typeof studentInputSchema>;
export type ImportedStudentInput = z.infer<typeof importedStudentSchema>;
export interface ProvisionedStudent { student: Student; username: string; password: string; userBacked: boolean }
export interface RosterActor { userId: number; isSystemAdmin?: boolean }
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };

async function uniqueUsername(manager: EntityManager, input: ImportedStudentInput) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = input.username || generateUsername(input.firstName, input.lastName, input.middleName);
    const bounded = candidate.length > 100 ? `${candidate.slice(0, 90)}_${candidate.slice(-4)}` : candidate;
    const taken = await manager.getRepository(User).existsBy({ username: bounded }) || await manager.getRepository(Student).existsBy({ generatedUsername: bounded });
    if (!taken) return bounded;
    if (input.username) fail("USERNAME_ALREADY_EXISTS");
  }
  return fail("USERNAME_GENERATION_FAILED", 503);
}

/** Every row, its User account and org membership commit together; no fallback identities or partial batches. */
export async function provisionStudents(cls: Class, inputs: ImportedStudentInput[], actor?: RosterActor, operation?: CredentialOperationOptions): Promise<ProvisionedStudent[]> {
  const validated = z.array(importedStudentSchema).min(1).max(200).safeParse(inputs);
  if (!validated.success) return fail("INVALID_INPUT", 400);
  const emails = new Set<string>(), usernames = new Set<string>();
  for (const input of validated.data) {
    if (input.email && emails.has(input.email)) fail("DUPLICATE_STUDENT_EMAIL");
    if (input.username && usernames.has(input.username.toLowerCase())) fail("USERNAME_ALREADY_EXISTS");
    if (input.email) emails.add(input.email); if (input.username) usernames.add(input.username.toLowerCase());
  }
  if (operation && !actor) return fail("INVALID_INPUT", 400);
  const started = operation ? await beginCredentialOperation(actor!, cls.id, operation, validated.data, validated.data.length) : undefined;
  const replay = (rows: CredentialRow[]) => rows.map(row => ({ student: AppDataSource.getRepository(Student).create({ id: row.id, class: cls, firstName: row.firstName, lastName: row.lastName, middleName: row.middleName, email: row.email, generatedUsername: row.username }), username: row.username, password: row.password, userBacked: true }));
  if (started?.credentials) return replay(started.credentials);
  try {
    const prepared = await Promise.all(validated.data.map(async input => {
      const password = input.password || generatePassword(); return { input, password, hashed: await hashPassword(password) };
    }));
    return await AppDataSource.transaction("READ COMMITTED", async manager => {
      const current = await manager.getRepository(Class).findOne({ where: { id: cls.id }, lock: { mode: "pessimistic_write" } });
      if (!current) fail("CLASS_NOT_FOUND", 404);
      if (actor && !(await authorizeClassAction(actor.userId, cls.id, "STUDENT_MANAGE", { manager, isSystemAdmin: actor.isSystemAdmin }))?.allowed) fail("FORBIDDEN", 403);
      const cached = await recheckCredentialOperation(manager, started?.handle);
      if (cached) return replay(cached);
      const results: ProvisionedStudent[] = [];
      for (const { input, password, hashed } of prepared) {
        if (input.email && (await manager.getRepository(User).existsBy({ email: input.email }) || await manager.getRepository(Student).existsBy({ class: { id: cls.id }, email: input.email }))) fail("EMAIL_ALREADY_EXISTS");
        const username = await uniqueUsername(manager, input);
        const user = await manager.getRepository(User).save(manager.getRepository(User).create({ username, email: input.email || null, password: hashed, role: "USER" }));
        const student = await manager.getRepository(Student).save(manager.getRepository(Student).create({ class: current!, user,
          firstName: input.firstName, lastName: input.lastName, middleName: input.middleName || null, email: input.email || "", generatedUsername: username, generatedPassword: hashed, userAccountManaged: true }));
        if (current!.organizationId != null) await manager.getRepository(Membership).save(manager.getRepository(Membership).create({ user, organization: { id: current!.organizationId }, role: "STUDENT" }));
        results.push({ student, username, password, userBacked: true });
      }
      await completeCredentialOperation(manager, started?.handle, results.map(({ student, username, password }) => ({ id: student.id, firstName: student.firstName, lastName: student.lastName, middleName: student.middleName || "", email: student.email, username, password })));
      return results;
    });
  } catch (error) {
    await abandonCredentialOperation(started?.handle);
    const record = error as { code?: string; sqlMessage?: string };
    if (record.code === "ER_DUP_ENTRY") fail(record.sqlMessage?.toLowerCase().includes("email") ? "EMAIL_ALREADY_EXISTS" : "USERNAME_ALREADY_EXISTS");
    throw error;
  }
}
export async function provisionStudent(cls: Class, input: StudentInput): Promise<ProvisionedStudent> { return (await provisionStudents(cls, [input]))[0]; }
