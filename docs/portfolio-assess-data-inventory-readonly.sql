-- StudyCod Portfolio / Assess legacy-data inventory (MySQL 8+)
--
-- Read-only evidence gathering only. Run against an explicitly approved
-- database identity with SELECT access after confirming the backup identifier
-- and restore point outside this report. This script does not migrate, copy,
-- update, or delete rows. It emits aggregate counts only; it does not emit
-- usernames, emails, source code, invitation tokens, or public-link tokens.
--
-- Expected schema: the existing 1792800000000, 1792900000000, and
-- 1793000000000 growth-project/company/interview migrations are applied.
-- Portfolio tables added by 1793200000000+ are optional in this report. Run
-- the Portfolio companion only after the five tables, four grades verification
-- columns, and Evidence Pack skill_ids_json column are confirmed below.

START TRANSACTION READ ONLY;

-- Confirm that the expected legacy tables exist before interpreting counts.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'growth_projects',
    'growth_project_queue_guard',
    'growth_project_artifacts',
    'growth_project_jobs',
    'growth_project_versions',
    'growth_project_assessments',
    'growth_project_publications',
    'growth_project_reviewer_grants',
    'growth_project_reviews',
    'growth_companies',
    'growth_company_members',
    'growth_company_assessments',
    'growth_interview_kits',
    'growth_interviews',
    'growth_interview_notes',
    'growth_interview_messages',
    'growth_interview_quizzes',
    'portfolio_profiles',
    'portfolio_works',
    'portfolio_evidence',
    'portfolio_evidence_packs',
    'portfolio_sourced_evidence'
  )
ORDER BY table_name;

-- Verify whether the optional grades facts needed by the Portfolio companion
-- report are present before running that report.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'grades'
  AND column_name IN ('verification_method', 'judge_verdict', 'tests_passed', 'tests_total')
ORDER BY column_name;

-- The current Portfolio companion report also requires the Evidence Pack
-- competency column introduced by migration 1794300000000.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'portfolio_evidence_packs'
  AND column_name = 'skill_ids_json';

-- Exact row counts for records whose preservation is part of the rebuild.
SELECT 'growth_projects' AS table_name, COUNT(*) AS row_count FROM growth_projects
UNION ALL SELECT 'growth_project_queue_guard', COUNT(*) FROM growth_project_queue_guard
UNION ALL SELECT 'growth_project_artifacts', COUNT(*) FROM growth_project_artifacts
UNION ALL SELECT 'growth_project_jobs', COUNT(*) FROM growth_project_jobs
UNION ALL SELECT 'growth_interview_jobs', COUNT(*) FROM growth_project_jobs WHERE interview_id IS NOT NULL
UNION ALL SELECT 'growth_project_versions', COUNT(*) FROM growth_project_versions
UNION ALL SELECT 'growth_project_assessments', COUNT(*) FROM growth_project_assessments
UNION ALL SELECT 'growth_project_publications', COUNT(*) FROM growth_project_publications
UNION ALL SELECT 'growth_project_reviewer_grants', COUNT(*) FROM growth_project_reviewer_grants
UNION ALL SELECT 'growth_project_reviews', COUNT(*) FROM growth_project_reviews
UNION ALL SELECT 'growth_companies', COUNT(*) FROM growth_companies
UNION ALL SELECT 'growth_company_members', COUNT(*) FROM growth_company_members
UNION ALL SELECT 'growth_company_assessments', COUNT(*) FROM growth_company_assessments
UNION ALL SELECT 'growth_interview_kits', COUNT(*) FROM growth_interview_kits
UNION ALL SELECT 'growth_interviews', COUNT(*) FROM growth_interviews
UNION ALL SELECT 'growth_interview_notes', COUNT(*) FROM growth_interview_notes
UNION ALL SELECT 'growth_interview_messages', COUNT(*) FROM growth_interview_messages
UNION ALL SELECT 'growth_interview_quizzes', COUNT(*) FROM growth_interview_quizzes
ORDER BY table_name;

-- The notifications table and its type enum are shared with Blog. Historical
-- Project/Company down() methods delete feature alerts, narrow the shared enum,
-- and the Project rollback drops related_path. Count every type and populated
-- path field without exposing recipients, actors, paths, or message data.
SELECT type,
       COUNT(*) AS notification_count,
       SUM(related_path IS NOT NULL) AS notifications_with_related_path
FROM notifications
GROUP BY type
ORDER BY type;

-- Project work and publication state. Public IDs and owner IDs are not emitted.
SELECT archived, COUNT(*) AS project_count
FROM growth_projects
GROUP BY archived
ORDER BY archived;

SELECT channel, revoked, COUNT(*) AS publication_count
FROM growth_project_publications
GROUP BY channel, revoked
ORDER BY channel, revoked;

SELECT state, COUNT(*) AS job_count
FROM growth_project_jobs
GROUP BY state
ORDER BY state;

SELECT kind, status, COUNT(*) AS project_assessment_count
FROM growth_project_assessments
GROUP BY kind, status
ORDER BY kind, status;

SELECT kind, status, COUNT(*) AS review_count
FROM growth_project_reviews
GROUP BY kind, status
ORDER BY kind, status;

-- Hiring tenant, consent, and in-progress assessment state.
SELECT role, status, COUNT(*) AS membership_count
FROM growth_company_members
GROUP BY role, status
ORDER BY role, status;

SELECT status,
       COUNT(*) AS assessment_count,
       SUM(project_id IS NOT NULL) AS with_selected_project,
       SUM(version_id IS NOT NULL) AS with_selected_version,
       SUM(technical_assessment_id IS NOT NULL) AS with_judge_assessment
FROM growth_company_assessments
GROUP BY status
ORDER BY status;

SELECT status,
       COUNT(*) AS interview_count,
       SUM(source_version_id IS NOT NULL) AS with_shared_project_version,
       SUM(final_artifact_id IS NOT NULL) AS with_final_artifact
FROM growth_interviews
GROUP BY status
ORDER BY status;

-- Personal Learn sources available to the explicit workbench importer, and
-- how many already have a matching import record. Candidate counts are broad:
-- the importer also validates each source's runtime and saved code/files.
-- These counts are not proof of importability and do not authorize deleting
-- or altering source rows.
WITH imported AS (
  SELECT owner_id,
         CASE WHEN JSON_VALID(source_json) THEN JSON_UNQUOTE(JSON_EXTRACT(source_json, '$.kind')) END AS source_type,
         CASE WHEN JSON_VALID(source_json) THEN JSON_UNQUOTE(JSON_EXTRACT(source_json, '$.sourceId')) END AS source_id
  FROM growth_projects
  WHERE source_json IS NOT NULL
), candidates AS (
  SELECT DISTINCT 'PERSONAL_MINI_PROJECT' AS source_type, t.user_id AS owner_id, CAST(t.id AS CHAR) AS source_id
  FROM tasks t
  JOIN users u ON u.id = t.user_id AND u.user_mode = 'PERSONAL'
  WHERE t.completed = 1 AND t.subtitle LIKE 'MPJ:%'
  UNION
  SELECT DISTINCT 'COURSE_PROJECT', e.user_id, CAST(p.item_id AS CHAR)
  FROM course_item_progress p
  JOIN user_course_enrollments e ON e.id = p.enrollment_id
  JOIN users u ON u.id = e.user_id AND u.user_mode = 'PERSONAL'
  JOIN course_items ci ON ci.id = p.item_id
  JOIN course_modules cm ON cm.id = ci.module_id
  JOIN courses c ON c.id = cm.course_id AND c.org_id IS NULL
  WHERE p.status = 'COMPLETED'
    AND CASE WHEN JSON_VALID(ci.content)
             THEN JSON_EXTRACT(ci.content, '$.projectSpec') END IS NOT NULL
  UNION
  SELECT DISTINCT 'LIBRARY_PROJECT', a.user_id, CAST(a.library_task_id AS CHAR)
  FROM library_task_attempts a
  JOIN users u ON u.id = a.user_id AND u.user_mode = 'PERSONAL'
  JOIN library_tasks t ON t.id = a.library_task_id
  WHERE t.project_spec IS NOT NULL
)
SELECT c.source_type,
       COUNT(*) AS candidate_source_count,
       SUM(EXISTS (
         SELECT 1 FROM imported i
         WHERE i.owner_id = c.owner_id AND i.source_type = c.source_type AND i.source_id = c.source_id
       )) AS already_imported_count,
       SUM(NOT EXISTS (
         SELECT 1 FROM imported i
         WHERE i.owner_id = c.owner_id AND i.source_type = c.source_type AND i.source_id = c.source_id
       )) AS not_yet_imported_count
FROM candidates c
GROUP BY c.source_type
ORDER BY c.source_type;

ROLLBACK;
