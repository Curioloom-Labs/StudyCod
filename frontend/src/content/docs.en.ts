import type { DocsSection } from "./docs.types";

export const DOCS_SECTIONS_EN: DocsSection[] = [
  {
    id: "welcome",
    title: "StudyCod in 2 minutes",
    audience: "ALL",
    tags: ["welcome", "overview", "start"],
    content: `
## What this platform is for

StudyCod helps you:
- learn programming step by step,
- solve tasks,
- get checked and graded,
- track your progress.

![StudyCod overview](/docs/overview.svg)

### Available modes
- **EDU** — class-based learning (student/teacher).
- **Personal** — self-paced practice without a class.

### Fast start
1. Open the tasks/lessons area.
2. Complete your first task.
3. Check the result.
4. Review progress in profile/grades.
`
  },
  {
    id: "getting-started",
    title: "First steps after login",
    audience: "ALL",
    tags: ["first-login", "start", "steps"],
    content: `
## What to do right after login

### If you are a student (EDU)
1. Open **Lessons**.
2. Enter a topic.
3. Pick a practice task or a control work.
4. Submit your solution.
5. Check your grade in the gradebook.

### If you are a teacher (EDU)
1. Create a class.
2. Add students.
3. Create a topic and tasks.
4. Assign tasks to the class.
5. Review submissions and set grades.

### If you are in Personal mode
1. Open tasks.
2. Choose a task that fits your level.
3. Solve and submit.
4. Track progress in profile.
`
  },
  {
    id: "navigation",
    title: "Where everything is",
    audience: "ALL",
    tags: ["navigation", "menu", "where"],
    content: `
## Platform map

### Student (EDU)
- **Lessons** — topics, practice, control works.
- **My gradebook** — grades for tasks and controls.
- **Announcements** — important teacher messages.

### Teacher (EDU)
- **Classes** — student management.
- **Topics** — create practice and control works.
- **Gradebook** — grading workflow.

### Personal mode
- **Tasks** — main practice flow.
- **Profile / Grades** — progress and history.

![Student lessons](/docs/screens/edu-student-lessons.svg)
`
  },
  {
    id: "ux-acceptance",
    title: "What good UX looks like",
    audience: "ALL",
    tags: ["ux", "comfort", "workflow"],
    content: `
## User comfort checklist

This page explains what “good experience” means in StudyCod:

- **Back** returns you to a logical place.
- Run/check output appears in a separate, clear block.
- No horizontal layout breaks on mobile.
- Average grade appears only when there are actual grades.

If any of these fail, it is a valid reason to contact support.
`
  },
  {
    id: "profile-progress-model",
    title: "Profile: how to read progress",
    audience: "ALL",
    tags: ["profile", "progress", "badges", "grades"],
    content: `
## Two different progress tracks

### 1) Library tasks (badges)
- Shows how many tasks you completed.
- Unlocks motivation badges at milestones.

### 2) Learning progress (grades)
- Shows number of grades, average grade, excellent results.
- This is your academic progress.

### Important
These are separate: badges are not your average grade.
`
  },
  {
    id: "edu-student",
    title: "EDU for students: daily workflow",
    audience: "EDU",
    tags: ["student", "edu", "daily"],
    content: `
## Daily flow for a student

1. Open the assigned topic.
2. Read the task statement.
3. Write your solution.
4. Run/check.
5. Submit.
6. Review status and grade.

### For control work
- Check timer first (if present).
- Complete quiz part (if present).
- Complete practical part (if present).
- Finish the attempt.
`
  },
  {
    id: "edu-teacher",
    title: "EDU for teachers: from setup to grading",
    audience: "EDU",
    tags: ["teacher", "edu", "workflow"],
    content: `
## Core teacher cycle

1. Create class.
2. Add students.
3. Create topic.
4. Add practice tasks.
5. Optionally add control work.
6. Assign to students.
7. Grade in the gradebook.

Tip: shorter, regular topics usually work better than one giant topic.
`
  },
  {
    id: "edu-topics",
    title: "Topics (TOPIC): how to structure",
    audience: "EDU",
    tags: ["topic", "edu", "assign"],
    content: `
## Working with topics

![Topic page](/docs/screens/edu-topic-page.svg)

A topic should contain:
- practice tasks,
- control/self-study works,
- clear learning order.

### Student-facing rule
If something is unassigned, it must disappear from student lists.
`
  },
  {
    id: "edu-tasks",
    title: "Practice tasks: submission and grading",
    audience: "EDU",
    tags: ["practice", "submission", "grading"],
    content: `
## Practice task flow

![Practice check](/docs/screens/edu-practice-task-check.svg)

### Student side
- open task,
- write code,
- submit.

### Teacher side
- open submission,
- review,
- set grade (1–12).

### Important rule
If a manual grade exists, re-submission can be locked until it is removed.
`
  },
  {
    id: "edu-controlworks",
    title: "Control / self-study works",
    audience: "EDU",
    tags: ["control", "quiz", "timer", "summary"],
    content: `
## Control work flow

![Control flow](/docs/controlwork-flow.svg)

A control work may include:
- quiz,
- practical tasks,
- time limit.

After completion, it produces **one final control grade**.
`
  },
  {
    id: "edu-quizzes",
    title: "Quizzes: what students see after submit",
    audience: "EDU",
    tags: ["quiz", "results", "student"],
    content: `
## Quiz results

After submitting a quiz, students can see:
- total result,
- per-question correctness (✅/❌).

![Quiz editor](/docs/screens/edu-quiz-editor.svg)
![Quiz results](/docs/screens/edu-quiz-results.svg)
`
  },
  {
    id: "edu-gradebook",
    title: "Gradebook: how to read columns",
    audience: "EDU",
    tags: ["gradebook", "columns", "edu"],
    content: `
## Gradebook logic

![Gradebook columns](/docs/gradebook-columns.svg)

- **Practice** — one column per task.
- **Control** — one column per control work.
- **Thematic** — optional summary column.
`
  },
  {
    id: "edu-thematic",
    title: "Thematic grade explained",
    audience: "EDU",
    tags: ["thematic", "intermediate", "grade"],
    content: `
## What thematic grade means

Thematic (INTERMEDIATE) is an optional topic-level summary grade managed in the gradebook.

![Thematic in gradebook](/docs/screens/edu-gradebook-thematic.svg)
`
  },
  {
    id: "edu-import-export",
    title: "Import / export students (CSV)",
    audience: "EDU",
    tags: ["csv", "import", "export", "teacher"],
    content: `
## When to use CSV

Import/export is useful for large classes and semester transitions.

### Tips
- Use UTF-8 files.
- Refresh class page after import.
- Export first as a backup before bulk changes.
`
  },
  {
    id: "edu-announcements",
    title: "Class announcements",
    audience: "EDU",
    tags: ["announcements", "class", "email"],
    content: `
## Why announcements matter

Announcements are the fastest way to notify the whole class about:
- deadlines,
- schedule changes,
- exam reminders.

In some setups, they can also be sent via email.
`
  },
  {
    id: "grading",
    title: "How grades are formed",
    audience: "ALL",
    tags: ["grading", "scores", "rules"],
    content: `
## Grading basics

### Practice tasks
- Graded based on solution quality and checks.

### Control works
- One final grade per control work.

### Scale
- 12-point scale (1–12).
`
  },
  {
    id: "personal",
    title: "Personal mode: self-paced learning",
    audience: "PERSONAL",
    tags: ["personal", "self-study", "solo"],
    content: `
## Who it is for

Personal mode is for independent learning:
- pick tasks,
- solve at your own pace,
- track your own progress.
`
  },
  {
    id: "personal-tasks",
    title: "Personal mode: effective task workflow",
    audience: "PERSONAL",
    tags: ["personal", "tasks", "progress", "tips"],
    content: `
## Practical workflow

1. Choose a task slightly above your comfort level.
2. Solve in small iterations.
3. Run checks after each meaningful step.
4. After success, note what you learned.

![Personal tasks](/docs/screens/personal-tasks.svg)
`
  },
  {
    id: "faq",
    title: "FAQ",
    audience: "ALL",
    tags: ["faq", "help", "questions"],
    content: `
## Common questions

### I am not sure where to click next
Start with **First steps after login** and follow it top to bottom.

### Where do I track progress
- EDU student: gradebook.
- Personal mode: profile/grades.

### Why can’t I submit
Most common causes: output format mismatch, or a manual grade lock.
`
  },
  {
    id: "troubleshooting",
    title: "If something is not working",
    audience: "ALL",
    tags: ["troubleshooting", "issues", "fix"],
    content: `
## Quick self-check before contacting support

1. Refresh page.
2. Repeat the action.
3. Confirm assignment/access is still active.
4. If issue remains, include:
   - what you did,
   - what you expected,
   - what happened,
   - screenshot.
`
  },
  {
    id: "privacy",
    title: "Privacy and security",
    audience: "ALL",
    tags: ["privacy", "security", "data"],
    content: `
## Important safety notes

- Use only your own account.
- Never share your password.
- If you suspect unauthorized access, change password and notify teacher/admin.

Docs use static interface illustrations for learning purposes.
`
  }
];

export default DOCS_SECTIONS_EN;
