import test from "node:test";
import assert from "node:assert/strict";
import { AddAssessInterviewExpiryIndex1794200000000 } from "./1794200000000-AddAssessInterviewExpiryIndex";

test("Assess expiry index migration adds and removes only the scheduling index", async () => {
  const migration = new AddAssessInterviewExpiryIndex1794200000000();
  const upStatements: string[] = [];
  await migration.up({
    getTable: async () => ({ indices: [] }),
    query: async (sql: string) => { upStatements.push(sql); return []; },
  } as any);
  assert.deepEqual(upStatements, ["ALTER TABLE growth_interviews ADD KEY ix_growth_interviews_expiry (status,started_at)"]);

  const downStatements: string[] = [];
  await migration.down({
    getTable: async () => ({ indices: [{ name: "ix_growth_interviews_expiry" }] }),
    query: async (sql: string) => { downStatements.push(sql); return []; },
  } as any);
  assert.deepEqual(downStatements, ["ALTER TABLE growth_interviews DROP INDEX ix_growth_interviews_expiry"]);
});

test("Assess expiry index migration is idempotent when the index already exists", async () => {
  const statements: string[] = [];
  const migration = new AddAssessInterviewExpiryIndex1794200000000();
  await migration.up({ getTable: async () => ({ indices: [{ name: "ix_growth_interviews_expiry" }] }), query: async (sql: string) => { statements.push(sql); return []; } } as any);
  await migration.down({ getTable: async () => ({ indices: [] }), query: async (sql: string) => { statements.push(sql); return []; } } as any);
  assert.deepEqual(statements, []);
});
