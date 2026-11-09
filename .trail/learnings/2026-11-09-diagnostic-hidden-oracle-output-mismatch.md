# Diagnostic assessments survive hidden oracle output mismatches

## Decided
Keep a generated hidden-test suite only when it passes contract review. If the hidden-test oracle still fails after its bounded retry, serve the practical task with its already reviewed public examples so diagnostic knowledge questions remain available. Log when this reduced-coverage fallback is used.

## Tried and ruled out
One semantic retry is not enough for every generated numeric oracle: production retried and still produced candidate outputs such as `0` where the reviewed task requires `0.0`, and scientific notation where the task requires decimal stdout. More retries alone only spend additional generation calls and cannot guarantee a consistent suite.

## Watch out
Never use public examples to mask a reviewer finding against the statement or the public examples themselves. This fallback preserves availability but reduces practical grading coverage; keep exact stdout formatting in the task and Python-oracle prompts, prefer the validated hidden suite, and use public examples only after a hidden-suite/provider failure.

## In the code
- `backend/src/services/courseDiagnosticAssessment.ts` selects a validated hidden suite or falls back to cleaned public examples; it rejects statement/public-example contract failures and logs fallback use.
- `backend/src/services/llm/ReferenceTestData.ts` tells the Python reference oracle to follow the task's exact decimal stdout format instead of Python's default float rendering.
- `backend/src/services/courseDiagnosticAssessment.test.ts` and `backend/src/services/llm/ReferenceTestData.test.ts` cover repeated hidden-oracle failures and the decimal-formatting instruction with fake providers.
