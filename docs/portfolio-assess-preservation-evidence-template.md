# Portfolio and Assess preservation evidence intake

Use this record before a production data inventory or any proposal to migrate or remove legacy rows. It is an evidence checklist, not authorization to run production DDL, migrations, or deployment.

## Required artifacts

Provide an approved sanitized snapshot of the relevant schema and representative rows, plus a restore-test report for that exact snapshot. Preserve keys and relationships needed to exercise the migration while replacing personal identifiers and removing secrets or source code that is not needed for the check.

The snapshot should cover the affected Personal, EDU, subscription/access, Learn, Judge, Project, and Assess tables. Include enough linked records to test owners, memberships and roles, progress and grades, project versions/publications, interview state, and Judge results. Keep sanitized primary and foreign keys consistent across tables.

If the snapshot cannot be shared, an operator may instead provide a redacted report containing the fields below and before/after reconciliation results from a migration rehearsal on an isolated restored copy. That report is useful evidence, but it does not let this repository independently rerun the rehearsal.

## Snapshot record

- Approval/reference and restricted artifact location:
- Snapshot identifier:
- Source database identity (redacted as needed), engine/version, and schema state:
- Snapshot creation time (UTC):
- Artifact SHA-256 or immutable storage version:
- Sanitization performed and tables included:
- Operator/contact for verification (no credentials):

## Restore and rehearsal record

- Restore-test report/log location and SHA-256 or immutable version:
- Restore time (UTC) and isolated target identifier:
- Confirmation that the target was non-production and disconnected from production writes:
- Result: restore completed / failed, with failure details if applicable:
- Migration revision rehearsed:
- Before/after aggregate counts for affected tables:
- Referential-integrity and owner/source mapping checks:
- Disposition for rows not represented in the new Portfolio model:
- Confirmation that legacy source rows and public compatibility links remain valid, or documented exceptions:
- Confirmation that public responses contain no unintended private identifiers, private code, or secrets:

## Acceptance checks

- [ ] Snapshot approval, timestamp, schema identity, and integrity reference are recorded.
- [ ] The restore report refers to the same snapshot identifier or checksum and records a successful isolated restore.
- [ ] The rehearsal ran only against the restored copy; no production migration or deployment occurred.
- [ ] Counts reconcile, relationships and source ownership remain valid, and every unmapped row has a recorded disposition.
- [ ] The evidence is redacted; no credentials, raw personal data, private code, or bearer tokens are included.

Keep the snapshot and full restore logs in the approved restricted location. Attach only the sanitized artifact and redacted evidence approved for this review.
