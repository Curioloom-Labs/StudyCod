# Diagnostic assessments survive hidden oracle output mismatches

## Decided
Keep a generated hidden-test suite only when it passes contract review. If the hidden-test oracle fails on candidate cases or provider availability, serve the practical task with its already reviewed public examples so diagnostic knowledge questions remain available. If review rejects the task statement or public examples, regenerate the entire practical package once with explicit decimal-format guidance before failing. Log both recovery paths.

## Tried and ruled out
One semantic retry is not enough for every generated numeric oracle: production retried and still produced candidate outputs such as `0` where the reviewed task requires `0.0`, and scientific notation where the task requires decimal stdout. A later request exposed a separate false-negative in task review: hidden-test review found the generated `TIME` output lacked precision even though task generation had accepted it. More hidden-test retries cannot repair a bad statement.

## Watch out
Never use public examples to mask a reviewer finding against the statement or the public examples themselves. Regenerate the whole package once for those findings; fail if the replacement still fails. The public-example fallback preserves availability but reduces practical grading coverage; keep exact stdout formatting in the task and Python-oracle prompts, prefer the validated hidden suite, and use public examples only after a hidden-suite/provider failure.

## In the code
- `backend/src/services/courseDiagnosticAssessment.ts` regenerates the whole practical once for statement/public-example review failures; otherwise it selects a validated hidden suite or falls back to cleaned public examples, with a log for either recovery.
- `backend/src/services/llm/ReferenceTestData.ts` tells the Python reference oracle to follow the task's exact decimal stdout format instead of Python's default float rendering.
- `backend/src/services/courseDiagnosticAssessment.test.ts` and `backend/src/services/llm/ReferenceTestData.test.ts` cover repeated hidden-oracle failures and the decimal-formatting instruction with fake providers.
