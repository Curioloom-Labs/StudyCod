# StudyCod Assess ATS integration

StudyCod Assess exposes a company-scoped, versioned API and signed webhooks for applicant tracking systems. Configure keys and webhook subscriptions in **Assess → Integrations** as a company owner.

## API access

Base URL: `/api/v1/assess`

Send the API key as `Authorization: Bearer <API_KEY>`. Create separate keys for each integration, grant only the scopes it needs, and revoke a key from the integrations panel when it is no longer used. The full key is shown once.

| Method | Endpoint | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/assessments` | `assessments:read` | List assessments; supports `page`, `pageSize` (maximum 100), `search`, `status`, and ISO `updatedSince` filters. |
| `GET` | `/assessments/:assessmentId` | `assessments:read` | Read one assessment in the key's company. |
| `POST` | `/assessments` | `assessments:write` | Create and email a candidate invitation. |

The API returns `version: "v1"`. Read responses include assessment and candidate identifiers, role title/profile, status, submitted-answer timestamp, time estimate, deadline, tool policy, the final-decision outcome/date/candidate-release flag when one exists, and created/updated timestamps. Candidate answers and private work are not included.

### Create an invitation

`POST /assessments` requires an `Idempotency-Key` header between 8 and 128 characters. Reuse the same key and identical request body after a timeout; changing the body while reusing a key returns `409 IDEMPOTENCY_CONFLICT`.

```http
POST /api/v1/assess/assessments HTTP/1.1
Authorization: Bearer <API_KEY>
Idempotency-Key: ats-application-78431
Content-Type: application/json
```

```json
{
  "candidateEmail": "candidate@example.com",
  "roleTitle": "Senior QA Engineer",
  "roleProfile": "QA_AUTOMATION",
  "introduction": "You will discuss a real API testing scenario and share the experience you choose.",
  "questions": [
    { "id": "risk-plan", "text": "How would you prioritize coverage for this API?" },
    { "id": "flaky-test", "text": "How would you investigate an intermittent failing test?" }
  ],
  "estimatedMinutes": 45,
  "deadlineAt": null,
  "aiPolicy": "DISCUSS"
}
```

`roleProfile` can be `SOFTWARE_ENGINEERING`, `QA_AUTOMATION`, `DATA_AI`, `DEVOPS_SRE`, `SECURITY`, `PRODUCT_DESIGN`, `ENGINEERING_MANAGEMENT`, or `TECHNICAL_SUPPORT`. It defaults to `SOFTWARE_ENGINEERING`. Questions must contain 2–8 unique IDs. `estimatedMinutes` defaults to 45; `aiPolicy` defaults to `DISCUSS` and accepts `ALLOWED`, `NOT_ALLOWED`, or `DISCUSS`.

Successful creation returns `201` and an assessment ID. If invitation email delivery fails, the API returns `502 INVITATION_EMAIL_NOT_SENT`; retry the identical request with the same idempotency key so delivery can be retried without creating another assessment.

## Webhooks

Create an HTTPS endpoint and select the events to receive. Targets resolving to private or non-public IP addresses are rejected. Each delivery is a JSON `POST` with these headers:

| Header | Meaning |
| --- | --- |
| `X-StudyCod-Event` | Event name. |
| `X-StudyCod-Delivery` | Stable delivery event ID; use it to deduplicate retries. |
| `X-StudyCod-Timestamp` | Unix timestamp in seconds used in the signature. |
| `X-StudyCod-Signature` | `sha256=<hex HMAC-SHA256>` signature. |

The signature is `HMAC-SHA256(webhookSecret, timestamp + "." + rawRequestBody)`. Verify the exact raw bytes before parsing JSON, compare signatures in constant time, reject stale timestamps, and make handling idempotent by delivery ID. The signing secret is displayed once when the webhook is created.

Example event body:

```json
{
  "id": "delivery-event-id",
  "type": "assessment.decision_saved",
  "createdAt": "2026-11-22T12:00:00.000Z",
  "data": {
    "companyId": "company-id",
    "assessmentId": "assessment-id",
    "status": "REVIEWED",
    "outcome": "ADVANCE",
    "releaseToCandidate": false,
    "decidedAt": "2026-11-22T12:00:00.000Z"
  }
}
```

The decision event carries the outcome and whether the candidate may see it; it does not include the internal rationale or candidate answers. Other events carry the company, assessment, and status fields appropriate to the event.

Webhook deliveries are marked complete on any `2xx` response. Network errors and non-`2xx` responses are retried with exponential backoff, up to 12 attempts; inspect the webhook delivery status in the integrations panel and re-enable or replace endpoints as needed. A timed-out endpoint may receive the same delivery more than once.

Supported events: `assessment.invited`, `assessment.claimed`, `assessment.accepted`, `assessment.declined`, `assessment.evidence_selected`, `assessment.answers_submitted`, `assessment.task_assigned`, `assessment.task_submitted`, `assessment.review_saved`, `assessment.decision_saved`, and `assessment.withdrawn`.
