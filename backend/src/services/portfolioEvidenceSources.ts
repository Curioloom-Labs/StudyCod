import { AppDataSource } from "../data-source";
import { readCurrentAwardsByContestIds } from "./contest/awards";

export const PORTFOLIO_SOURCED_EVIDENCE_TYPES = [
  "LEARNING_ACTIVITY",
  "LEARNING_COURSE",
  "PROJECT_PUBLICATION",
  "ASSESSMENT_FEEDBACK",
  "ASSESSMENT_TASK_RESULT",
  "COMPETITION_RESULT",
] as const;

export type PortfolioSourcedEvidenceType = typeof PORTFOLIO_SOURCED_EVIDENCE_TYPES[number];

export type PortfolioSourcedEvidenceSource = {
  sourceType: PortfolioSourcedEvidenceType;
  sourceKey: string;
  title: string;
  sourceLabel: string;
  detail: string;
  verifiedAt: Date | string;
  language?: string;
  testsPassed?: number;
  testsTotal?: number;
  acceptedProblems?: number;
};

type SourceRow = Record<string, unknown>;

const mapRows = (
  rows: SourceRow[],
  sourceType: PortfolioSourcedEvidenceType,
  sourceLabel: string,
  detail: (row: SourceRow) => string,
): PortfolioSourcedEvidenceSource[] => rows.map(row => ({
  sourceType,
  sourceKey: String(row.sourceKey),
  title: String(row.title ?? ""),
  sourceLabel,
  detail: detail(row),
  verifiedAt: row.verifiedAt as Date | string,
  ...(row.language ? { language: String(row.language) } : {}),
  ...(row.testsPassed != null ? { testsPassed: Number(row.testsPassed) } : {}),
  ...(row.testsTotal != null ? { testsTotal: Number(row.testsTotal) } : {}),
  ...(row.acceptedProblems != null ? { acceptedProblems: Number(row.acceptedProblems) } : {}),
}));

/**
 * Returns only records the Personal account can safely cite in a public
 * portfolio. EDU rows, hidden contest standings, unreleased interview notes,
 * and unpublicized StudyCod projects are excluded at the source.
 */
export async function listPortfolioSourcedEvidenceSources(ownerId: number): Promise<PortfolioSourcedEvidenceSource[]> {
  const [courses, learningActivities, publications, assessments, assessmentTasks, contestOptionalTableRows] = await Promise.all([
    AppDataSource.query(
      `SELECT CAST(e.id AS CHAR) AS sourceKey,c.title AS title,e.completed_at AS verifiedAt
       FROM user_course_enrollments e
       JOIN users u ON u.id=e.user_id AND u.user_mode='PERSONAL'
       JOIN courses c ON c.id=e.course_id AND c.org_id IS NULL AND c.status='PUBLISHED'
       WHERE e.user_id=? AND e.status='COMPLETED' AND e.completed_at IS NOT NULL
       ORDER BY e.completed_at DESC LIMIT 100`, [ownerId]
    ) as Promise<SourceRow[]>,
    AppDataSource.query(
      `SELECT CAST(p.id AS CHAR) AS sourceKey,CONCAT(c.title,' · ',ci.title) AS title,p.completed_at AS verifiedAt,
              v.runtime AS language,ci.kind AS activityKind,c.title AS courseTitle
       FROM course_item_progress p
       JOIN user_course_enrollments e ON e.id=p.enrollment_id AND e.user_id=?
       JOIN users u ON u.id=e.user_id AND u.user_mode='PERSONAL'
       JOIN course_items ci ON ci.id=p.item_id AND ci.is_active=1
       JOIN course_modules m ON m.id=ci.module_id
       JOIN courses c ON c.id=m.course_id AND c.id=e.course_id AND c.org_id IS NULL AND c.status='PUBLISHED'
       JOIN course_variants v ON v.id=e.variant_id AND v.course_id=c.id AND v.status='PUBLISHED'
       WHERE p.status='COMPLETED' AND p.completed_at IS NOT NULL
       ORDER BY p.completed_at DESC LIMIT 100`, [ownerId]
    ) as Promise<SourceRow[]>,
    AppDataSource.query(
      `SELECT p.id AS sourceKey,p.title AS title,p.updated_at AS verifiedAt,p.description AS projectDescription
       FROM growth_project_publications p
       JOIN growth_projects g ON g.id=p.project_id AND g.owner_id=p.owner_id
       JOIN users u ON u.id=p.owner_id AND u.user_mode='PERSONAL'
       WHERE p.owner_id=? AND p.revoked=0
       ORDER BY p.updated_at DESC LIMIT 100`, [ownerId]
    ) as Promise<SourceRow[]>,
    AppDataSource.query(
      `SELECT i.id AS sourceKey,a.role_title AS title,MAX(n.released_at) AS verifiedAt,
              COUNT(DISTINCT n.user_id) AS reviewerCount
       FROM growth_interviews i
       JOIN growth_company_assessments a ON a.id=i.assessment_id AND a.candidate_id=?
       JOIN growth_interview_notes n ON n.interview_id=i.id AND n.released_at IS NOT NULL
         AND IF(JSON_VALID(n.released_json),JSON_UNQUOTE(JSON_EXTRACT(n.released_json,'$.allowPublicPortfolio')),'false')='true'
       JOIN users u ON u.id=a.candidate_id AND u.user_mode='PERSONAL'
       WHERE i.status='COMPLETED' AND a.status NOT IN ('WITHDRAWN','CLOSED','DECLINED')
       GROUP BY i.id,a.role_title
       ORDER BY verifiedAt DESC LIMIT 100`, [ownerId]
    ) as Promise<SourceRow[]>,
    AppDataSource.query(
      `SELECT CAST(pa.id AS CHAR) AS sourceKey,a.task_title AS title,pa.status AS resultStatus,
              pa.completed_at AS verifiedAt,j.result_json AS judgeResultJson
       FROM growth_company_assessments a
       JOIN growth_project_assessments pa ON pa.id=a.technical_assessment_id AND pa.company_assessment_id=a.id AND pa.owner_id=a.candidate_id
       JOIN growth_project_jobs j ON j.id=pa.job_id AND j.state='COMPLETED'
       JOIN users u ON u.id=a.candidate_id AND u.user_mode='PERSONAL'
       WHERE a.candidate_id=? AND a.status='REVIEWED' AND pa.kind='COMPANY_TASK'
         AND IF(JSON_VALID(a.technical_review_json),JSON_UNQUOTE(JSON_EXTRACT(a.technical_review_json,'$.allowPortfolioEvidence')),'false')='true'
         AND pa.status IN ('PASSED','FAILED') AND pa.completed_at IS NOT NULL AND a.task_title IS NOT NULL
       ORDER BY pa.completed_at DESC LIMIT 100`, [ownerId]
    ) as Promise<SourceRow[]>,
    AppDataSource.query(
      `SELECT TABLE_NAME AS tableName FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name IN ('contest_annulments','contest_organizers','contest_awards','certificates')`
    ) as Promise<SourceRow[]>,
  ]);

  const contestOptionalTables = new Set(contestOptionalTableRows.map(row =>
    String(row.tableName ?? row.TABLE_NAME ?? Object.values(row)[0] ?? "").toLowerCase()
  ));
  const annulmentFilter = contestOptionalTables.has("contest_annulments")
    ? `AND NOT EXISTS (
         SELECT 1 FROM contest_annulments ca
         WHERE ca.contest_id=s.contest_id AND ca.problem_id=s.problem_id AND ca.is_active=1
           AND ca.participant_id IN (0,s.participant_id)
       )`
    : "";
  const organizerFilter = contestOptionalTables.has("contest_organizers")
    ? `AND NOT EXISTS (
         SELECT 1 FROM contest_organizers co
         WHERE co.contest_id=s.contest_id AND co.user_id=sp.user_id
       )`
    : "";
  const certificateSelect = contestOptionalTables.has("certificates")
    ? "certificate.place_text AS certificatePlace,"
    : "NULL AS certificatePlace,";
  const certificateJoin = contestOptionalTables.has("certificates")
    ? `LEFT JOIN certificates certificate ON certificate.contest_id=c.id AND certificate.participant_id=cp.id
         AND certificate.status IN ('rendered','emailed') AND certificate.issued_at IS NOT NULL AND certificate.revoked_at IS NULL`
    : "";
  const competitions = await AppDataSource.query(
    `SELECT CAST(cp.id AS CHAR) AS sourceKey,c.id AS contestId,cp.id AS participantId,c.title AS title,c.ends_at AS verifiedAt,
            COALESCE(result.acceptedProblems,0) AS acceptedProblems,${certificateSelect}
     FROM contest_participants cp
     JOIN contests c ON c.id=cp.contest_id
     JOIN users u ON u.id=cp.user_id AND u.user_mode='PERSONAL'
     ${certificateJoin}
     LEFT JOIN (
       SELECT s.contest_id,s.participant_id,COUNT(DISTINCT s.problem_id) AS acceptedProblems
       FROM contest_submissions s
       JOIN contests sc ON sc.id=s.contest_id
       JOIN contest_participants sp ON sp.id=s.participant_id AND sp.contest_id=s.contest_id
       WHERE s.phase='CONTEST' AND s.execution_status='completed' AND s.verdict='AC'
         AND sp.user_id=? AND sp.principal_type='USER' AND sp.is_disqualified=0
         AND (sc.created_by_user_id IS NULL OR sp.user_id<>sc.created_by_user_id)
         AND (sc.starts_at IS NULL OR s.created_at>=sc.starts_at)
         AND (sc.ends_at IS NULL OR s.created_at<=DATE_ADD(sc.ends_at, INTERVAL (
           COALESCE(sc.safety_global_extension_seconds,0)
           + CASE WHEN sc.safety_alerts_enabled=1 THEN COALESCE(sp.safety_extension_seconds,0)
             + CASE WHEN sp.safety_pause_started_at IS NOT NULL AND sp.safety_pause_until IS NOT NULL
               THEN LEAST(600,GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,sp.safety_pause_started_at,sp.safety_pause_until)/1000000)))
               ELSE 0 END
             ELSE 0 END
           + CASE WHEN sc.safety_global_lock_started_at IS NOT NULL
             THEN GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,
               GREATEST(sc.safety_global_lock_started_at,COALESCE(sc.starts_at,sc.safety_global_lock_started_at)),UTC_TIMESTAMP(3))/1000000))
             ELSE 0 END
         ) SECOND))
         ${annulmentFilter}
         ${organizerFilter}
       GROUP BY s.contest_id,s.participant_id
     ) result ON result.contest_id=c.id AND result.participant_id=cp.id
     WHERE cp.user_id=? AND cp.principal_type='USER' AND cp.is_disqualified=0
       AND c.visibility='PUBLIC' AND c.is_published=1 AND c.ends_at IS NOT NULL
       AND c.scoreboard_visibility<>'ORGANIZERS_ONLY'
       AND (c.created_by_user_id IS NULL OR cp.user_id<>c.created_by_user_id)
       AND DATE_ADD(c.ends_at, INTERVAL (
         CASE WHEN c.safety_alerts_enabled=1 THEN COALESCE((
           SELECT MAX(COALESCE(p.safety_extension_seconds,0) +
             CASE WHEN p.safety_pause_started_at IS NOT NULL AND p.safety_pause_until IS NOT NULL
               THEN LEAST(600,GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,p.safety_pause_started_at,p.safety_pause_until)/1000000)))
               ELSE 0 END)
           FROM contest_participants p WHERE p.contest_id=c.id
         ),0) ELSE 0 END
         + COALESCE(c.safety_global_extension_seconds,0)
         + CASE WHEN c.safety_global_lock_started_at IS NOT NULL
           THEN GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,
             GREATEST(c.safety_global_lock_started_at,COALESCE(c.starts_at,c.safety_global_lock_started_at)),UTC_TIMESTAMP(3))/1000000))
           ELSE 0 END
       ) SECOND) <= UTC_TIMESTAMP(3)
     ORDER BY c.ends_at DESC LIMIT 100`, [ownerId, ownerId]
  ) as SourceRow[];

  const awardsTablesAvailable = ["certificates", "contest_awards", "contest_annulments", "contest_organizers"]
    .every(table => contestOptionalTables.has(table));
  if (awardsTablesAvailable && competitions.some(row => row.certificatePlace != null)) {
    const contestIds = [...new Set(competitions
      .filter(row => row.certificatePlace != null)
      .map(row => Number(row.contestId))
      .filter(id => Number.isSafeInteger(id) && id > 0))];
    const confirmedAwards = await readCurrentAwardsByContestIds(contestIds);
    for (const row of competitions) {
      const contestId = Number(row.contestId);
      const participantId = Number(row.participantId);
      const certificatePlace = Number(row.certificatePlace);
      const confirmedPlace = confirmedAwards.get(contestId)?.find(award => award.participantId === participantId)?.awardPlace;
      if (!Number.isInteger(certificatePlace) || certificatePlace < 1 || certificatePlace > 3 || confirmedPlace !== certificatePlace) {
        row.certificatePlace = null;
      }
    }
  } else {
    for (const row of competitions) row.certificatePlace = null;
  }

  const assessmentTaskSources: PortfolioSourcedEvidenceSource[] = assessmentTasks.map(row => {
    let result: Record<string, unknown> = {};
    try {
      const parsed = typeof row.judgeResultJson === "string" ? JSON.parse(row.judgeResultJson) : row.judgeResultJson;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed as Record<string, unknown>;
    } catch { /* malformed historical Judge details do not become portfolio evidence */ }
    const testsPassed = Number(result.testsPassed ?? 0);
    const testsTotal = Number(result.testsTotal ?? 0);
    const resultStatus = String(row.resultStatus) === "PASSED" ? "Passed" : "Did not pass";
    return {
      sourceType: "ASSESSMENT_TASK_RESULT",
      sourceKey: String(row.sourceKey),
      title: String(row.title ?? "Technical assessment"),
      sourceLabel: "StudyCod Assess · reviewed Judge task",
      detail: testsTotal > 0
        ? `${resultStatus} · ${testsPassed}/${testsTotal} tests passed; reviewed by the company.`
        : `${resultStatus}; reviewed by the company.`,
      verifiedAt: row.verifiedAt as Date | string,
      ...(testsTotal > 0 ? { testsPassed, testsTotal } : {}),
    };
  });

  return [
    ...mapRows(learningActivities, "LEARNING_ACTIVITY", "StudyCod Learn · completed course activity", row => {
      const courseTitle = typeof row.courseTitle === "string" ? row.courseTitle : "the course";
      const kind = String(row.activityKind ?? "activity");
      const activity = ({ CODE_TASK: "code task", WEB_TASK: "web task", QUIZ: "quiz", MANUAL: "reviewed assignment", THEORY: "lesson", PAGE: "lesson" } as Record<string, string>)[kind] ?? "course activity";
      return `${activity} completed in ${courseTitle}.`;
    }),
    ...mapRows(courses, "LEARNING_COURSE", "StudyCod Learn · course completion", () => "Course completion recorded by StudyCod."),
    ...mapRows(publications, "PROJECT_PUBLICATION", "StudyCod project publication", row => {
      const description = typeof row.projectDescription === "string" ? row.projectDescription.trim() : "";
      return description ? description.slice(0, 300) : "Published StudyCod project.";
    }),
    ...mapRows(assessments, "ASSESSMENT_FEEDBACK", "StudyCod Assess · released interview feedback", row => {
      const count = Number(row.reviewerCount ?? 0);
      return `${count} interviewer${count === 1 ? "" : "s"} released feedback to the candidate.`;
    }),
    ...assessmentTaskSources,
    ...mapRows(competitions, "COMPETITION_RESULT", "StudyCod competition · official result", row => {
      const count = Number(row.acceptedProblems ?? 0);
      const place = Number(row.certificatePlace);
      const issuedPlace = Number.isInteger(place) && place >= 1 && place <= 3 ? place : null;
      const award = issuedPlace == null ? "" : ` StudyCod award certificate confirms place ${issuedPlace}.`;
      return `${count} problem${count === 1 ? "" : "s"} accepted during the official contest window.${award}`;
    }),
  ].sort((left, right) => new Date(right.verifiedAt).getTime() - new Date(left.verifiedAt).getTime());
}

export async function findPortfolioSourcedEvidenceSource(
  ownerId: number,
  sourceType: PortfolioSourcedEvidenceType,
  sourceKey: string,
): Promise<PortfolioSourcedEvidenceSource | null> {
  const sources = await listPortfolioSourcedEvidenceSources(ownerId);
  return sources.find(source => source.sourceType === sourceType && source.sourceKey === sourceKey) ?? null;
}
