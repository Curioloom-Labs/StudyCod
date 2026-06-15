import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Student } from "../entities/Student";

export type PrincipalType = "USER" | "STUDENT";

export type PrincipalRef = { type: PrincipalType; id: number };

export type PrincipalInfo = {
  type: PrincipalType;
  id: number;
  name: string;
  avatarUrl: string | null;
};

const keyOf = (type: PrincipalType, id: number) => `${type}:${id}`;

function userName(u: User): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.username || `User #${u.id}`;
}

function studentName(s: Student): string {
  const full = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
  return full || s.generatedUsername || `Student #${s.id}`;
}

/**
 * Batch-resolves a set of polymorphic principals to display name + avatar in two
 * queries (one per account type), returning a map keyed by "TYPE:id".
 */
export async function resolvePrincipals(refs: PrincipalRef[]): Promise<Map<string, PrincipalInfo>> {
  const out = new Map<string, PrincipalInfo>();
  const userIds = [...new Set(refs.filter(r => r.type === "USER").map(r => r.id))];
  const studentIds = [...new Set(refs.filter(r => r.type === "STUDENT").map(r => r.id))];

  if (userIds.length) {
    const users = await AppDataSource.getRepository(User).find({ where: { id: In(userIds) } });
    for (const u of users) {
      out.set(keyOf("USER", u.id), {
        type: "USER",
        id: u.id,
        name: userName(u),
        avatarUrl: u.avatarUrl ?? null
      });
    }
  }

  if (studentIds.length) {
    const students = await AppDataSource.getRepository(Student).find({ where: { id: In(studentIds) } });
    for (const s of students) {
      out.set(keyOf("STUDENT", s.id), {
        type: "STUDENT",
        id: s.id,
        name: studentName(s),
        avatarUrl: s.avatarUrl ?? null
      });
    }
  }

  return out;
}

export function principalKey(type: PrincipalType, id: number): string {
  return keyOf(type, id);
}

/** Estimates reading time in minutes from Markdown content (~200 wpm, min 1). */
export function estimateReadingMinutes(content: string): number {
  const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
