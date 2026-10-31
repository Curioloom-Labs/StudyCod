# StudyCod AI prompt package

Current package version: `studycod-ai-2026-10-31-v1` in `shared/ai/prompts/index.ts`.

Set `AI_PROMPT_BUNDLE_ENABLED=false` in the backend environment to select the legacy shared-policy/defaults version. The backend sends that version to the Worker, and prompt, schema, and model-aware caches use a separate legacy namespace. For a full rollback of scenario-specific instruction edits, deploy the previous application revision as well.

`PromptSpec` is the source of truth for stable ID, purpose, supported locales, context contract, output format, server validation, and default temperature/token limit. The caller's explicit generation settings override the catalog defaults. Backend calls use `generatePromptText` / `generatePromptJSON`; the AI service and Cloudflare Worker use the same catalog metadata and shared policy. Provider and HTTP response shapes remain unchanged.

## Scenario inventory

| Prompt ID | Primary consumer | Output and contract checks |
| --- | --- | --- |
| `task.anchor` | `backend/src/services/llm/LLMOrchestrator.ts` | Anchor JSON; canonical topic and normalized learning scope |
| `task.generate` | `backend/src/services/llm/LLMOrchestrator.ts`, `backend/src/services/ai/safeAICall.ts`, Cloudflare Worker | Task JSON; response validator, curriculum policy, contract review, and reference execution when available |
| `task.condition` | `backend/src/services/llm/LLMOrchestrator.ts`, Cloudflare Worker | Markdown statement; task-condition validation |
| `task.condition-draft` | `backend/src/services/llm/LLMOrchestrator.ts` | Structured statement and exactly three examples; canonical Markdown rendering and task-condition validation |
| `task.template` | `backend/src/services/llm/LLMOrchestrator.ts`, Cloudflare Worker | Source-only starter template; language normalization and starter checks |
| `task.theory` | `backend/src/services/llm/LLMOrchestrator.ts`, Cloudflare Worker | Markdown theory; theory validation |
| `task.quiz` | `backend/src/services/llm/LLMOrchestrator.ts`, Cloudflare Worker | Quiz JSON; parser and count/options/correct-index validation |
| `task.generation-guidance` | `backend/src/services/llm/LLMOrchestrator.ts` | Editable generation guidance and settings JSON; `AIResponseValidator` bounds and enum checks |
| `task.reference-tests` | `backend/src/services/llm/ReferenceTestData.ts` | Python oracle plus candidate inputs; Zod validation, duplicate filtering, Judge execution, contract review |
| `task.generated-tests` | `backend/src/services/llm/LLMOrchestrator.ts`, Cloudflare Worker | Judge test JSON; response validator and contract review |
| `task.contract-review` | `backend/src/services/llm/TaskContractReview.ts` | Review JSON; schema and statement/test consistency checks |
| `mentor.hints` | `backend/src/services/ai/failureHints.ts` | Hint ladder JSON; schema, sanitization, count bounds, deterministic fallback |
| `mentor.explain-error` | `backend/src/services/ai/failureHints.ts` | Error explanation JSON; schema and evidence-based response normalization |
| `mentor.debug` | `backend/src/services/ai/debugMentor.ts` | Short text coaching; non-empty result and output normalization |
| `edu.tutor` | `backend/src/services/edu/aiTutor.ts` | Tutor answer/tips JSON; schema and response normalization |
| `edu.code-review` | `backend/src/services/edu/aiCodeReview.ts` | Review JSON with nullable line; provider schema, line bounds, normalization |
| `edu.live-copilot` | `backend/src/services/edu/liveCopilot.ts` | Briefing JSON; schema, required-content checks, rule fallback |
| `grading.code-critic` | `backend/src/services/grading/LLMCodeCritic.ts` | Critic JSON; provider schema and normalized output |
| `grading.evaluation` | `backend/src/ai/evaluator.ts` | Rubric JSON; schema and bounds; Judge remains authoritative for execution verdicts |
| `integrity.code-detection` | `backend/src/services/ai/aiCodeDetector.ts` | Advisory likelihood/evidence JSON; Zod schema and score bounds |
| `content.interactive-lesson` | `backend/src/services/openRouterService.ts` | Lesson JSON; route-level required-field checks |
| `content.dataset` | `backend/src/services/datasetCollector.ts` | Serialized training example; dataset quality filters before inclusion |
| `platform.general` | AI-service, Cloudflare Worker | Application JSON request; caller schema and server validation |
| `platform.generic-text` | AI-service, Cloudflare Worker | Application text request; non-empty response check |

## Request flow and safeguards

- Shared policy marks learner code, task text, Judge messages, chat history, and imported content as data. `formatUntrustedData` serializes context without stripping source code or whitespace; use it when assembling data-heavy multi-turn contexts.
- `AIExecutionContext` carries package version, trace ID, end-to-end deadline, abort signal, and a shared two-retry budget. Transport retries, model/key fallbacks, semantic retries, and format retries consume the same budget.
- Logs from registered calls record prompt ID/version, locale, output type, duration, response size, outcome, trace ID, and retry count. They do not include full prompts, learner code, or hidden tests.
- `LLMCacheService`, task-anchor caches, and AI-code-detection caches use the package version in their namespace. Prompt/schema/context changes therefore cannot reuse previous-version results.
- Reference expected outputs are generated by the existing Judge execution path, not copied from a model-generated output field.

## Regression fixtures and current measurement boundary

`backend/src/services/llm/promptExecution.test.ts` contains a deterministic 210-case contract matrix: 21 registered functional scenarios × 5 context classes × 2 locales. It checks policy, ID/version, locale, and exact context preservation, including injection-shaped text, source code, Unicode, and long context. Provider retry-budget checks live beside the OpenRouter provider tests; Worker request validation has a separate Worker test.

These fixtures measure prompt construction and contracts, not model answer quality. A live old-versus-new comparison, p50/p95 latency, token cost, success rate, and fallback rate require the same provider/model credentials and a bounded production-like evaluation run; they are not inferred from unit tests. Record those measures with the bundle version before broad rollout.
