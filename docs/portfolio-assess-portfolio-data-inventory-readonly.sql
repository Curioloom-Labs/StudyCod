-- StudyCod Portfolio data inventory (MySQL 8+)
--
-- Run only after the first inventory's information_schema result confirms all
-- five portfolio_* tables and the grades verification columns exist. This
-- report is SELECT-only inside a read-only transaction. It emits aggregate
-- counts only and never emits usernames, emails, source content, code, grant
-- tokens, or pack hashes.
--
-- Requires Portfolio migrations 1793200000000 through 1794300000000,
-- including AddPersonalSubmissionVerification1793300000000 and
-- AddPortfolioEvidencePackSkills1794300000000.

START TRANSACTION READ ONLY;

-- Exact counts for rows that belong to the new Portfolio feature.
SELECT 'portfolio_profiles' AS table_name, COUNT(*) AS row_count FROM portfolio_profiles
UNION ALL SELECT 'portfolio_works', COUNT(*) FROM portfolio_works
UNION ALL SELECT 'portfolio_evidence', COUNT(*) FROM portfolio_evidence
UNION ALL SELECT 'portfolio_evidence_packs', COUNT(*) FROM portfolio_evidence_packs
UNION ALL SELECT 'portfolio_sourced_evidence', COUNT(*) FROM portfolio_sourced_evidence
UNION ALL SELECT 'grades', COUNT(*) FROM grades
ORDER BY table_name;

-- Owner visibility and archival state, without owner identifiers or contents.
SELECT visibility, COUNT(*) AS profile_count
FROM portfolio_profiles
GROUP BY visibility
ORDER BY visibility;

SELECT visibility, (archived_at IS NOT NULL) AS archived, COUNT(*) AS work_count,
       SUM(source_publication_id IS NOT NULL) AS attached_publication_count
FROM portfolio_works
GROUP BY visibility, (archived_at IS NOT NULL)
ORDER BY visibility, archived;

SELECT visibility, (archived_at IS NOT NULL) AS archived, COUNT(*) AS judge_evidence_count
FROM portfolio_evidence
GROUP BY visibility, (archived_at IS NOT NULL)
ORDER BY visibility, archived;

SELECT source_type, visibility, (archived_at IS NOT NULL) AS archived, COUNT(*) AS sourced_evidence_count
FROM portfolio_sourced_evidence
GROUP BY source_type, visibility, (archived_at IS NOT NULL)
ORDER BY source_type, visibility, archived;

-- Pack state and number of explicitly selected references. No bearer secret is
-- returned; revocation and expiry are counted independently.
SELECT COUNT(*) AS pack_count,
       SUM(revoked_at IS NOT NULL) AS revoked_count,
       SUM(expires_at <= UTC_TIMESTAMP(3)) AS expired_count,
       SUM(revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)) AS active_count,
       SUM(CASE WHEN JSON_VALID(work_ids_json) THEN JSON_LENGTH(work_ids_json) ELSE 0 END) AS selected_work_references,
       SUM(CASE WHEN JSON_VALID(evidence_ids_json) THEN JSON_LENGTH(evidence_ids_json) ELSE 0 END) AS selected_evidence_references,
       SUM(CASE WHEN JSON_VALID(skill_ids_json) THEN JSON_LENGTH(skill_ids_json) ELSE 0 END) AS selected_competency_references,
       SUM(CASE WHEN skill_ids_json IS NOT NULL AND skill_ids_json <> '[]' THEN 1 ELSE 0 END) AS packs_with_nonempty_skill_ids_json
FROM portfolio_evidence_packs;

-- Snapshot of Personal verification facts added to the existing grades table.
SELECT verification_method, judge_verdict, COUNT(*) AS grade_count,
       SUM(tests_total IS NOT NULL) AS with_test_counts,
       SUM(CASE WHEN verification_method = 'ONLINE_JUDGE' AND judge_verdict = 'AC'
                     AND tests_total > 0 AND tests_passed = tests_total THEN 1 ELSE 0 END) AS complete_judge_acceptances
FROM grades
GROUP BY verification_method, judge_verdict
ORDER BY verification_method, judge_verdict;

ROLLBACK;
