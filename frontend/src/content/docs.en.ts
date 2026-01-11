import type { DocsSection } from "./docs.types";
export const DOCS_SECTIONS_EN: DocsSection[] = [{
  id: "welcome",
  title: "What is StudyCod",
  audience: "ALL",
  tags: ["welcome", "overview", "studycod"],
  content: `
## StudyCod — a platform to learn programming

![StudyCod overview (EDU vs Personal)](/docs/overview.svg)

StudyCod has **two modes**:

- **EDU**: learning in a class (teacher ↔ students), topics, control/self-study works, gradebook, announcements.
- **Personal**: individual tasks and progress, no classes.

### Who is it for
- **Student**: solves tasks, passes control/self-study works, sees grades.
- **Teacher**: creates topics/tasks/control works, sets deadlines, manages the gradebook.
- **Admin**: system settings (if enabled).

### Main areas
- **EDU → Lessons**: topics and control works assigned to you.
- **EDU → Gradebook**: grades by topic/task/control work.
- **Announcements**: teacher messages for the whole class (can also be emailed).
- **Docs / Wiki**: this help center.

### Terms (quick)
- **Topic (TOPIC)**: a set of practice tasks.
- **Control/Self-study (CONTROL)**: one final grade (quiz + practice by formula).
- **Thematic grade (INTERMEDIATE)**: an optional intermediate grade created in the gradebook.

### Quick links
- EDU (student): \`/edu/lessons\`
- EDU (teacher): \`/edu\` → classes
- Docs: \`/docs\` or \`/edu/docs\`
`
}, {
  id: "getting-started",
  title: "Getting started (first login)",
  audience: "ALL",
  tags: ["start", "first-visit", "account"],
  content: `
## First login

### If you are a student (EDU)
1. Log in with the credentials provided by your teacher.
2. Open **EDU → Lessons** (\`/edu/lessons\`).
3. Open a topic → pick a task → solve → submit.
4. For control/self-study: press **Start control work**, then complete quiz/tasks.
5. See your grades in **My gradebook**.

### If you are a teacher (EDU)
1. Create a **class**.
2. Add students (manually or import). Save generated logins/passwords.
3. Create a **topic** → add **practice tasks** → (optional) set deadline.
4. Create a **control/self-study** inside a topic: enable quiz and/or practice part, set grading formula.
5. Manage grades in the **gradebook**.
6. (Optional) post an **announcement** for the class.

### If you are in Personal mode
1. Pick a **task**.
2. Solve and submit.
3. Track progress in **Grades**.
`
}, {
  id: "navigation",
  title: "Navigation map (where to find what)",
  audience: "ALL",
  tags: ["navigation", "routes", "menu"],
  content: `
## Navigation

### EDU (student)
- **Lessons**: \`/edu/lessons\` — topics + control works (inside topics).
- **Topic**: practice tasks + control works list.
- **Control work**: quiz (if enabled) + tasks (if enabled) + status + timer.

> Screenshot:
> \`![EDU → Lessons](/docs/screens/edu-student-lessons.svg)\`

### EDU (teacher)
- **Classes**: \`/edu\`
- **Class**: students, topics, announcements, gradebook
- **Topic**: practice tasks + control works

### Personal
- **Tasks**: \`/tasks\`
- **Grades / progress**: \`/grades\`
- **Theory** (if available): \`/theory\`
`
}, {
  id: "edu-student",
  title: "EDU: student (topics, tasks, control works)",
  audience: "EDU",
  tags: ["edu", "student", "topic", "control"],
  content: `
## EDU: Student guide

### Topic (TOPIC)
Inside a topic you can see:
- **Practice tasks** (PRACTICE)
- **Control/self-study works** (CONTROL)

### Practice task (PRACTICE)
1. Open the task
2. Write your solution
3. Press **Submit**

> If the teacher set a **manual grade**, submissions can be locked until the teacher deletes that grade.

### Control/self-study work (CONTROL)
A control work can include:
- a quiz
- practical tasks

After completion, you will see the final grade (and quiz ✅/❌ review if enabled).
`
}, {
  id: "edu-teacher",
  title: "EDU: teacher (quick guide)",
  audience: "EDU",
  tags: ["edu", "teacher", "create", "assign", "gradebook"],
  content: `
## EDU: Teacher guide

### Typical workflow
1. Create a **class**
2. Add **students**
3. Create a **topic**
4. Add **practice tasks**
5. (Optional) add **control/self-study work** inside the topic
6. **Assign** to students
7. Use the **gradebook** to manage grades
`
}, {
  id: "edu-topics",
  title: "EDU: topics (TOPIC)",
  audience: "EDU",
  tags: ["topic", "assign", "deadline"],
  content: `
## Topic (TOPIC)

![Teacher topic page](/docs/screens/edu-topic-page.svg)

### What a topic contains
- practice tasks list
- control works list
- **Assign / Unassign** controls

### Unassign rule
When a task/control work is **unassigned**, it should disappear from student lists and from the gradebook (columns and grades removed).
`
}, {
  id: "edu-tasks",
  title: "EDU: practice tasks (PRACTICE)",
  audience: "EDU",
  tags: ["practice", "tasks", "grading"],
  content: `
## Practice tasks

![Practice task check](/docs/screens/edu-practice-task-check.svg)

### How grading works
- Student submits → teacher reviews → grade (1–12)
- Teacher can set a grade manually (even without submission)

### Manual grade lock
If a **manual grade** exists, the student cannot submit until the teacher deletes it.
`
}, {
  id: "edu-controlworks",
  title: "EDU: control/self-study works (CONTROL)",
  audience: "EDU",
  tags: ["control", "quiz", "timer"],
  content: `
## Control/self-study works

![CONTROL flow](/docs/controlwork-flow.svg)

### Statuses
NOT_STARTED → IN_PROGRESS → COMPLETED

### Final grade
Control work gives **one final grade** (SummaryGrade, type CONTROL).
`
}, {
  id: "edu-quizzes",
  title: "EDU: quizzes — ✅/❌ review",
  audience: "EDU",
  tags: ["quiz", "results", "review"],
  content: `
## Quizzes

> \`![Quiz editor](/docs/screens/edu-quiz-editor.svg)\`

After submission, the student can see:
- total score
- per-question ✅/❌ correctness

> \`![Quiz results](/docs/screens/edu-quiz-results.svg)\`
`
}, {
  id: "edu-gradebook",
  title: "EDU: gradebook",
  audience: "EDU",
  tags: ["gradebook", "columns"],
  content: `
## Gradebook

![Gradebook columns logic](/docs/gradebook-columns.svg)

### Columns
- **Practice**: per-task columns
- **Control**: one column per control work
- **Thematic**: a separate INTERMEDIATE column
`
}, {
  id: "edu-thematic",
  title: "EDU: thematic grade (INTERMEDIATE)",
  audience: "EDU",
  tags: ["intermediate", "thematic"],
  content: `
## Thematic grade

> \`![Thematic in gradebook](/docs/screens/edu-gradebook-thematic.svg)\`

The thematic grade is optional and is created/deleted in the gradebook.
`
}, {
  id: "edu-import-export",
  title: "EDU: CSV import / export",
  audience: "EDU",
  tags: ["csv", "import", "export"],
  content: `
## CSV import / export

### Where
- In class details: **Export** and **Import** buttons

### Tips
- Use UTF-8
- Refresh class page after import
`
}, {
  id: "edu-announcements",
  title: "EDU: announcements",
  audience: "EDU",
  tags: ["announcements", "email"],
  content: `
## Announcements

Announcements are teacher messages for the whole class. They can also be sent via email notifications.
`
}, {
  id: "grading",
  title: "How grading works",
  audience: "ALL",
  tags: ["grading", "manual"],
  content: `
## Grading

### Practice (PRACTICE)
- student submits → teacher reviews → grade
- manual grade is possible

### Control works (CONTROL)
- one final grade
- quiz review can show ✅/❌ per question
`
}, {
  id: "personal",
  title: "Personal mode (no classes)",
  audience: "PERSONAL",
  tags: ["personal", "solo"],
  content: `
## Personal mode

Personal mode is for self-paced learning: solve tasks and track your own progress without a class.
`
}, {
  id: "personal-tasks",
  title: "Personal: tasks & progress",
  audience: "PERSONAL",
  tags: ["personal", "tasks", "progress"],
  content: `
## Tasks & progress

> \`![Personal tasks](/docs/screens/personal-tasks.svg)\`

- Open tasks
- Solve
- Submit
- Track progress in **Grades**
`
}, {
  id: "faq",
  title: "FAQ",
  audience: "ALL",
  tags: ["faq", "help"],
  content: `
## FAQ

### Why is the UI mixed-language?
Because some strings were hardcoded, or some EN translation keys were missing. If you spot any, tell me the exact page and label.

### How do I add screenshots to Docs?
Put the file into:
- \`frontend/public/docs/screens/\`

Then reference in markdown:
- \`![Description](/docs/screens/my-screenshot.png)\`
`
}, {
  id: "troubleshooting",
  title: "Troubleshooting",
  audience: "ALL",
  tags: ["errors", "troubleshooting"],
  content: `
## Troubleshooting

### A page doesn't scroll in EDU
The EDU shell uses \`overflow-hidden\`, so pages must define their own scroll container (flex + min-h-0 + overflow-y-auto).

### A grade is not visible
Check:
- whether the task is assigned
- whether grades were deleted on unassign
`
}, {
  id: "privacy",
  title: "Privacy & data",
  audience: "ALL",
  tags: ["privacy", "data"],
  content: `
## Privacy

- Screenshots in Docs are static files from \`frontend/public\`.
`
}];
export default DOCS_SECTIONS_EN;