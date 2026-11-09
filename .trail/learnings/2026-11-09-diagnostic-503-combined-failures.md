# Diagnostic 503s can hide generation, provider, and storage failures

## Decided
Treat known task-semantic rejections such as `CORE_OPERATION_MISSING` as bounded whole-package regeneration cases even when the orchestrator returns a plain `Error`. Keep independent quiz batches and task packages in fresh prompt execution contexts, stop scheduling on the first worker failure, and await already active workers before returning. Store the course-wide JSON payload in `MEDIUMTEXT`; MySQL `TEXT` cannot hold a complete assessment for a large course. Verify exact per-topic quiz counts before accepting a generated assessment and issue one focused repair when topic markers are uneven.

Classify OpenRouter HTTP 402 responses by provider metadata: exhausted account credit should bypass that key, while `in_flight_budget_exhausted` is transient and should honor `Retry-After`. Keep provider concurrency bounded.

## Tried and ruled out
Retrying the browser request did not help because failures were server-side. One VDS run reached task generation but stopped on a semantic rejection; another generated the complete payload but the database rejected it as too large. Separate runs exposed exhausted provider keys and uneven quiz topic tags. These are distinct failure paths and need distinct repairs.

## Watch out
Unit tests and mocked generations do not satisfy the real VDS generation gate. A full pass must use a fake learner with 10 completed theory topics, generate the complete course assessment, save it, read it back, and verify exactly two questions per topic plus at least one practical test per task. If the configured provider has no credit, report that blocker rather than counting a partial run.

## In the code
`backend/src/services/courseDiagnosticAssessment.ts` owns semantic regeneration, worker settlement, and question coverage repair. `backend/src/services/llm/promptExecution.ts` scopes retry budgets to independent batches. `backend/src/services/llm/OpenRouterProvider.ts` distinguishes permanent credit exhaustion from transient in-flight limits. `backend/src/entities/CourseDiagnosticAssessment.ts` and `backend/src/migrations/1794900000000-WidenCourseDiagnosticAssessmentData.ts` provide large-payload storage and safe rollback. Targeted tests cover these boundaries.
