# StudyCod

StudyCod is an educational platform for learning programming in which practice plays the central role: write code → run it → pass tests → identify the mistake → fix it → receive an explanation. It was created in response to the widespread problem of formalized learning, where attention is focused on memorizing syntax rather than developing algorithmic and engineering thinking.

Here, learning resembles a real developer workflow, adapted for education: clear requirements, tests, rapid feedback, and transparent assessment.

## Project Idea

In programming, the most difficult part is not learning language constructs, but learning how to think: decomposing a problem into parts, designing a solution, considering edge cases, and refining the code to correctness and stability.

StudyCod shifts the emphasis from “reading theory” to “doing by hand.” The platform helps train:

- problem analysis;
- algorithm construction;
- careful implementation;
- working with errors and tests;
- the habit of improving a solution instead of stopping at the first attempt.

## What Makes StudyCod Distinctive

At the core of the platform are practical problem solving and objective automated evaluation.

- The user works with code in a convenient interface and submits a solution.
- The solution is checked against a set of tests, making the result repeatable and transparent.
- After evaluation, it is clear what works and what does not: exactly where the solution fails.
- Artificial intelligence is used as a learning assistant: it provides explanations and guidance rather than simply giving the answer.

## Two Operating Modes

### Personal Learning

A mode for independent practice at one’s own pace:

- task selection;
- repeated attempts and improvements;
- progress tracking;
- returning to difficult topics.

The goal is steady growth through systematic practice and short cycles of “attempt → feedback → correction.”

### Educational Mode (EDU)

A mode for an organized learning process in classes or groups:

- structure around topics and lessons;
- assignment distribution to a group;
- quizzes and assessments with deadlines;
- a gradebook and clear progress tracking for each student.

The goal is to make learning manageable for the instructor and transparent for the student.

## Working with Tasks

A task in StudyCod is not merely a textual statement but a learning scenario that guides the correct thinking process. A typical workflow is:

1. Review the task and examples.
2. Write a solution.
3. Run evaluation.
4. Receive a report: which tests passed and which failed.
5. Understand the cause of the error (from test results and explanations).
6. Correct the code and repeat.
7. Record the result after successful completion.

This cycle trains attentiveness and the habit of refining solutions to quality.

## The Role of Artificial Intelligence

Artificial intelligence in StudyCod acts as a learning enhancer:

- assists in creating learning materials and practical assignments;
- generates test data and variation so learning does not reduce to memorizing examples;
- explains typical mistakes and suggests a direction of reasoning;
- helps understand *why* the solution failed on tests.

The objective is to improve feedback quality and reduce routine instructor workload while preserving fairness of evaluation.

## Automated Solution Evaluation

Assessment is based on executing code in a controlled environment and running tests. This ensures:

- objective results;
- equal conditions for all users;
- rapid feedback;
- transparency — it is clear what exactly fails.

Evaluation is designed, in particular, for solutions written in **Java** and **Python**.

## Target Audience

- **Pupils and students** — to learn not only to write code but to solve problems and think algorithmically.
- **Teachers** — to prepare materials faster, provide practice, observe progress, and maintain transparent assessment.
- **Educational initiatives** — as a foundation for courses, clubs, distance learning, and research in the field of EdTech and AI.

## Cloudflare Turnstile (anti-bot)

By default, the project had Turnstile checks only for contest submission flow. To enable anti-bot checks for platform entry (login/register), configure both frontend and backend flags:

- Frontend (`frontend/.env`):
	- `VITE_TURNSTILE_SITE_KEY=<your_turnstile_site_key>`
	- `VITE_ENABLE_AUTH_TURNSTILE=true`

- Backend (`backend/.env`):
	- `TURNSTILE_SECRET_KEY=<your_turnstile_secret_key>`
	- `TURNSTILE_ENFORCE_AUTH=true`
	- Optional override: `TURNSTILE_VERIFY_URL=https://challenges.cloudflare.com/turnstile/v0/siteverify`

When enabled, backend enforces Turnstile verification for:

- `POST /auth/login`
- `POST /auth/contest-login`
- `POST /auth/register`
