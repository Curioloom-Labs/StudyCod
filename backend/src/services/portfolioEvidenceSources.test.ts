import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { AppDataSource } from "../data-source";
import { listPortfolioSourcedEvidenceSources } from "./portfolioEvidenceSources";

test("Portfolio sourced evidence lists platform-derived records and counts only official contest acceptances", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const contestId = 17;
  const participantId = 101;
  const contestSourceInputs: Record<string, Record<string, unknown>[]> = {
    contests: [{ id: contestId, title: "Open contest", scoring_mode: "ICPC", starts_at: "2026-10-13 10:00:00", ends_at: "2026-10-13 11:00:00", safety_alerts_enabled: 0, safety_global_lock_started_at: null, safety_global_extension_seconds: 0 }],
    participants: [{ id: participantId, display_name: "Ada", user_id: 42, student_id: null, principal_type: "USER", is_disqualified: 0, retain_participation: 0, safety_extension_seconds: 0, safety_pause_started_at: null, safety_pause_until: null }],
    submissions: [{ id: 1001, participant_id: participantId, problem_id: 9, created_at: "2026-10-13 10:30:00", verdict: "AC", score: 100, max_score: 100, execution_status: "completed" }],
    problems: [{ id: 9, points: 100, library_task_id: 5 }],
    annulments: [],
    organizers: [],
    maxScores: [{ id: 9, maxScore: 20 }],
  };
  const sourceVersion = crypto.createHash("sha256").update(JSON.stringify([
    contestSourceInputs.contests,
    contestSourceInputs.participants,
    contestSourceInputs.submissions,
    contestSourceInputs.problems,
    contestSourceInputs.annulments,
    contestSourceInputs.organizers,
    contestSourceInputs.maxScores,
  ])).digest("hex");
  const currentDecision = {
    participantId, displayName: "Ada", rank: 1, totalScore: 100, maxScore: 20, submissionCount: 1,
    isDisqualified: false, retainParticipation: false, awardPlace: 1,
  };
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("information_schema.tables")) return [
      { tableName: "contest_annulments" }, { tableName: "contest_organizers" }, { tableName: "contest_awards" }, { tableName: "certificates" },
    ];
    const contestIds = (values ?? []).map(Number);
    if (sql.includes("FROM contest_awards WHERE contest_id IN")) return [
      { contest_id: contestId, sourceVersion, decisions: JSON.stringify([currentDecision]) },
      { contest_id: 18, sourceVersion: "stale-source-version", decisions: JSON.stringify([{ ...currentDecision, participantId: 102, awardPlace: 2 }]) },
    ].filter(row => contestIds.includes(row.contest_id));
    if (sql.includes("FROM contests WHERE id IN")) return contestSourceInputs.contests.map(row => ({ contest_id: contestId, ...row }));
    if (sql.includes("FROM contest_participants WHERE contest_id IN")) return contestSourceInputs.participants.map(row => ({ contest_id: contestId, ...row }));
    if (sql.includes("FROM contest_submissions WHERE contest_id IN")) return contestSourceInputs.submissions.map(row => ({ contest_id: contestId, ...row }));
    if (sql.includes("SUM(COALESCE(t.points, 1))")) return contestSourceInputs.maxScores.map(row => ({ contest_id: contestId, ...row }));
    if (sql.includes("FROM contest_problems WHERE contest_id IN")) return contestSourceInputs.problems.map(row => ({ contest_id: contestId, ...row }));
    if (sql.includes("FROM contest_annulments WHERE contest_id IN") || sql.includes("FROM contest_organizers WHERE contest_id IN")) return [];
    if (sql.includes("FROM user_course_enrollments")) return [{ sourceKey: "course-1", title: "Java Core", verifiedAt: "2026-10-10T00:00:00.000Z" }];
    if (sql.includes("FROM course_item_progress")) return [{ sourceKey: "progress-1", title: "Python Fundamentals · Loops", verifiedAt: "2026-10-15T00:00:00.000Z", language: "PYTHON", activityKind: "CODE_TASK", courseTitle: "Python Fundamentals" }];
    if (sql.includes("FROM growth_project_publications")) return [{ sourceKey: "publication-1", title: "API service", verifiedAt: "2026-10-11T00:00:00.000Z", projectDescription: "Published API project" }];
    if (sql.includes("FROM growth_interviews")) return [{ sourceKey: "interview-1", title: "Backend interview", verifiedAt: "2026-10-12T00:00:00.000Z", reviewerCount: 2 }];
    if (sql.includes("FROM growth_company_assessments")) return [{ sourceKey: "assessment-task-1", title: "REST API task", resultStatus: "PASSED", verifiedAt: "2026-10-14T00:00:00.000Z", judgeResultJson: '{"passed":true,"testsPassed":8,"testsTotal":8,"code":"private"}' }];
    if (sql.includes("FROM contest_participants cp")) return [
      { sourceKey: "participant-1", contestId, participantId, title: "Open contest", verifiedAt: "2026-10-13T00:00:00.000Z", acceptedProblems: 3, certificatePlace: "1" },
      { sourceKey: "participant-stale", contestId: 18, participantId: 102, title: "Stale award contest", verifiedAt: "2026-10-12T00:00:00.000Z", acceptedProblems: 2, certificatePlace: "2" },
      { sourceKey: "participant-2", contestId: 19, participantId: 103, title: "Practice contest", verifiedAt: "2026-10-09T00:00:00.000Z", acceptedProblems: 2, certificatePlace: null },
    ];
    return [];
  });

  const sources = await listPortfolioSourcedEvidenceSources(42);
  assert.deepEqual(sources.map(source => source.sourceType), [
    "LEARNING_ACTIVITY", "ASSESSMENT_TASK_RESULT", "COMPETITION_RESULT", "ASSESSMENT_FEEDBACK", "COMPETITION_RESULT", "PROJECT_PUBLICATION", "LEARNING_COURSE", "COMPETITION_RESULT",
  ]);
  assert.deepEqual(queries.filter(query => query.values?.includes(42)).map(query => query.values), [[42], [42], [42], [42], [42], [42, 42]]);
  assert.equal(queries.filter(query => query.sql.includes("FROM contest_awards WHERE contest_id IN")).length, 1);
  assert.match(queries[5].sql, /information_schema\.tables/);
  assert.match(queries[0].sql, /u\.user_mode='PERSONAL'.*c\.org_id IS NULL/s);
  assert.match(queries[1].sql, /FROM course_item_progress.*u\.user_mode='PERSONAL'.*c\.org_id IS NULL/s);
  assert.match(queries[1].sql, /p\.status='COMPLETED'.*p\.completed_at IS NOT NULL/s);
  assert.match(queries[2].sql, /p\.revoked=0/);
  assert.match(queries[3].sql, /a\.candidate_id=\?/);
  assert.match(queries[3].sql, /n\.released_at IS NOT NULL/);
  assert.match(queries[3].sql, /IF\(JSON_VALID\(n\.released_json\),JSON_UNQUOTE\(JSON_EXTRACT\(n\.released_json,'\$\.allowPublicPortfolio'\)\),'false'\)='true'/);
  assert.match(queries[4].sql, /a\.status='REVIEWED'.*IF\(JSON_VALID\(a\.technical_review_json\),JSON_UNQUOTE\(JSON_EXTRACT\(a\.technical_review_json,'\$\.allowPortfolioEvidence'\)\),'false'\)='true'.*pa\.status IN \('PASSED','FAILED'\)/s);
  const competitionQuery = queries.find(query => query.sql.includes("FROM contest_participants cp"))?.sql ?? "";
  assert.match(competitionQuery, /c\.visibility='PUBLIC'.*c\.scoreboard_visibility<>'ORGANIZERS_ONLY'/s);
  assert.match(competitionQuery, /s\.phase='CONTEST' AND s\.execution_status='completed' AND s\.verdict='AC'/);
  assert.match(competitionQuery, /sc\.starts_at IS NULL OR s\.created_at>=sc\.starts_at/);
  assert.match(competitionQuery, /DATE_ADD\(sc\.ends_at, INTERVAL \([\s\S]*sp\.safety_extension_seconds[\s\S]*sc\.safety_global_lock_started_at/);
  assert.match(competitionQuery, /FROM contest_annulments ca[\s\S]*ca\.is_active=1[\s\S]*ca\.participant_id IN \(0,s\.participant_id\)/);
  assert.match(competitionQuery, /FROM contest_organizers co[\s\S]*co\.user_id=sp\.user_id/);
  assert.match(competitionQuery, /LEFT JOIN certificates certificate[\s\S]*certificate\.status IN \('rendered','emailed'\).*certificate\.issued_at IS NOT NULL.*certificate\.revoked_at IS NULL/);
  assert.match(competitionQuery, /result\.contest_id=c\.id AND result\.participant_id=cp\.id/);
  const batchAwardQuery = queries.find(query => query.sql.includes("FROM contest_awards WHERE contest_id IN"))?.sql ?? "";
  assert.match(batchAwardQuery, /WHERE contest_id IN \(\?,\?\)/);
  assert.equal(sources[0].sourceKey, "progress-1");
  assert.equal(sources[0].detail, "code task completed in Python Fundamentals.");
  assert.equal(sources[0].language, "PYTHON");
  assert.equal(sources[1].detail, "Passed · 8/8 tests passed; reviewed by the company.");
  assert.equal(sources[3].detail, "2 interviewers released feedback to the candidate.");
  const competitionSources = sources.filter(source => source.sourceType === "COMPETITION_RESULT");
  assert.equal(competitionSources[0].detail, "3 problems accepted during the official contest window. StudyCod award certificate confirms place 1.");
  assert.equal(competitionSources[1].detail, "2 problems accepted during the official contest window.");
  assert.equal(competitionSources[2].detail, "2 problems accepted during the official contest window.");
  assert.equal(sources.some(source => "companyName" in source || "judgeResultJson" in source), false);
});

test("Portfolio competition source remains compatible before optional contest admin tables exist", async t => {
  const queries: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    queries.push(sql);
    if (sql.includes("information_schema.tables")) return [];
    return [];
  });

  await listPortfolioSourcedEvidenceSources(42);
  const competitionQuery = queries.find(sql => sql.includes("FROM contest_participants cp")) ?? "";
  assert.ok(competitionQuery);
  assert.doesNotMatch(competitionQuery, /contest_annulments|contest_organizers|certificates/);
  assert.match(competitionQuery, /s\.execution_status='completed'.*s\.verdict='AC'/);
});
