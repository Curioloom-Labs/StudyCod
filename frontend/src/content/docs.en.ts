import type { DocsSection } from "./docs.types";

const DOCS_SECTIONS_EN_BASE: DocsSection[] = [
  {
    id: "welcome",
    title: "StudyCod: platform overview",
    audience: "ALL",
    tags: ["overview", "features", "start", "StudyCod"],
    content: `
## Programming education in one workspace

StudyCod brings courses, practice tasks, a code editor, automated checks, and visible progress together. The platform supports two core workflows:

- **Personal** — independent practice in the task library, playground, and learning materials.
- **EDU** — classroom learning with lessons, courses, control works, grades, calendar, and teacher interaction.

![StudyCod — courses, code, and progress in one workspace](/docs/studycod-handbook-cover.png)

### Where to start

| If you are… | Start with |
| --- | --- |
| Learning independently | **Task library** → choose a level and language |
| A student in a class | **Lessons** → open the assigned topic |
| A teacher | **Classes** → create or open a class |

> Your account keeps solutions, progress, grades, and active learning flows synced between devices.
`
  },
  {
    id: "getting-started",
    title: "First sign-in: set up in a few minutes",
    audience: "ALL",
    tags: ["sign in", "registration", "first steps", "profile"],
    content: `
## After signing in

1. Check your name, interface language, and learning mode in the profile.
2. Identify your workflow: **Personal**, **EDU student**, or **EDU teacher**.
3. Open the first available learning space.
4. Complete one small action: solve a task, join a class, or create a class.

### EDU student

Join with an invite link or code when provided. Assigned materials then appear under **Lessons**, while grades appear in the **Gradebook**.

### EDU teacher

Create a class, add students through invitations or import, then prepare the first topic. Assignment controls whether students can see a material.

### Personal

Open the library, filter by language and difficulty, and begin with a task you can finish in 10–20 minutes.
`
  },
  {
    id: "navigation",
    title: "Navigation: where to find everything",
    audience: "ALL",
    tags: ["navigation", "menu", "routes", "search"],
    content: `
## StudyCod map

![StudyCod navigation map with product areas](/docs/platform-map.svg)

### Interface legend

1. **Learn** — lessons, courses, and assigned materials.
2. **Practice** — task library and solution workspace.
3. **Results** — profile, progress, gradebook, and certificates.
4. **Class** — students, calendar, attendance, live classroom, and appeals; available in EDU according to role.
5. **Help** — documentation and support requests.

The current area has a selected state. On smaller screens, some navigation moves into the mobile menu while labels and destinations stay the same.
`
  },
  {
    id: "ux-acceptance",
    title: "Interface states and accessibility",
    audience: "ALL",
    tags: ["interface", "states", "accessibility", "mobile"],
    content: `
## Reading interface states

- **Green** — success, active selection, or completed progress.
- **Orange** — a hint or action worth noticing.
- **Yellow** — a warning, deadline, or achievement.
- **Pink** — an error, destructive action, or rejected result.
- **Gray** — secondary information or a temporarily unavailable action.

During loading, StudyCod shows a structured progress state; do not press the same action repeatedly. When an action is disabled, nearby text should explain whether access, timing, or a previous step is missing.

The interface supports light and dark themes, keyboard focus, and responsive layouts. Report unreadable important text or controls to Support.
`
  },
  {
    id: "profile-progress-model",
    title: "Profile, progress, and certificates",
    audience: "ALL",
    tags: ["profile", "progress", "certificates", "achievements"],
    content: `
## What progress represents

![Progress dashboard with streak, practice, and learning results](/docs/progress-dashboard.svg)

### Legend

- **Completed** — tasks or learning items completed in the selected context.
- **Performance** — EDU grades and summaries; it is not the same as solved-task count.
- **Streak** — practice consistency when enabled for your mode.
- **Certificates** — issued completion records with their own page and identifier.

Period and course filters change only the visible slice and do not delete history.
`
  },
  {
    id: "personal",
    title: "Personal: your independent learning path",
    audience: "PERSONAL",
    tags: ["Personal", "self-paced", "path", "practice"],
    content: `
## Who Personal is for

Personal supports practice without a class. You choose the language, difficulty, and pace while StudyCod saves solutions and progress.

Suggested rhythm:

1. Pick one focus topic for the week.
2. Begin with one short warm-up task.
3. Continue with 2–3 core tasks.
4. Use Playground for experiments without grading.
5. Review progress and select the next topic.
`
  },
  {
    id: "personal-tasks",
    title: "Task library: search, filters, and solutions",
    audience: "PERSONAL",
    tags: ["library", "tasks", "filters", "code"],
    content: `
## From discovery to an accepted solution

![Task library and solution workspace](/docs/task-workspace.svg)

### Interface legend

1. **Filters** narrow the catalog by difficulty, topic, and other available properties.
2. **Task card** shows title, level, and completion state.
3. **Statement** contains input, output, and examples.
4. **Editor** keeps your draft while you work.
5. **Run** checks the current code; **Submit** sends the final solution for judging.
6. **Result** explains test status, execution time, or an error.

Match the required output format before submitting. Extra console labels commonly cause a wrong answer.
`
  },
  {
    id: "playground",
    title: "Playground: code without a task",
    audience: "PERSONAL",
    tags: ["playground", "editor", "run", "share"],
    content: `
## When to use Playground

Playground is for small experiments, syntax checks, and sharing a code fragment. It does not create a grade or complete a library task.

1. Select an available runtime language.
2. Write code and add input when needed.
3. Run the program.
4. Review standard output and errors.
5. Share a link when that action is available.

Never place passwords, tokens, or personal data in shared code.
`
  },
  {
    id: "edu-student",
    title: "EDU student: lessons, work, and grades",
    audience: "EDU",
    tags: ["student", "lessons", "EDU", "daily workflow"],
    content: `
## Daily workflow

1. Open **Lessons** and find the active topic.
2. Review materials, deadline, and item order.
3. Complete practice or a quiz.
4. Check submission status.
5. Open the **Gradebook** to see the grade and details.

A material can be upcoming, active, or completed. When a teacher unassigns it, it leaves the active list. Use an appeal for a grade question when appeals are available for that work.
`
  },
  {
    id: "edu-teacher",
    title: "EDU teacher: complete workflow",
    audience: "EDU",
    tags: ["teacher", "EDU", "workflow", "management"],
    content: `
## From class setup to results

![Teacher workspace: class, learning, interaction, and analytics](/docs/teacher-workspace.svg)

1. Create a class and add students.
2. Attach a course or build your own topic structure.
3. Add materials, practice tasks, quizzes, or control works.
4. Configure access and dates.
5. Teach asynchronously or through Live Classroom.
6. Review submissions, gradebook, attendance, and appeals.

### Workspace legend

- **Prepare** — classes, courses, topics, and calendar.
- **Teach** — materials, practice, quizzes, and control works.
- **Interact** — live classroom, announcements, and appeals.
- **Analyze** — gradebook, summary grades, attendance, and solution similarity.
`
  },
  {
    id: "edu-classes",
    title: "Classes, students, and organization",
    audience: "EDU",
    tags: ["classes", "students", "organization", "roles"],
    content: `
## Managing a learning group

The class page is the entry point for students, topics, gradebook, attendance, live classroom, and other class tools.

### Adding students

- **Invitation** — the student opens a link or enters a join code.
- **Import** — best for a prepared list and a large class.
- **Organization** — manages participants and roles across the learning space when available to your account.

Before removing a participant, check whether their results need to be retained or exported.
`
  },
  {
    id: "edu-courses",
    title: "Courses and learning materials",
    audience: "EDU",
    tags: ["courses", "materials", "templates", "updates"],
    content: `
## How courses work

A course organizes learning into a sequence of materials and topics. Teachers can inspect a course, use it in a class, and manage the available structure.

1. Open **Courses**.
2. Select a course and review its contents.
3. Attach or apply it to the intended class when available.
4. Verify topic order and student access.
5. Review available source-course updates before applying them.

Avoid applying an update during an active control work or before reviewing its changes.
`
  },
  {
    id: "edu-topics",
    title: "Topics and lessons: structure and assignment",
    audience: "EDU",
    tags: ["topics", "lessons", "assignment", "materials"],
    content: `
## Building a clear topic

A good topic has a concise goal, explanatory material, practice, and a clear completion criterion.

1. Create a topic or lesson in the intended class.
2. Add a description and learning materials.
3. Arrange items in a logical order.
4. Add practice, a quiz, or a control work.
5. Assign it and verify dates.

**Assigned** means students can access the material. **Unassigned** means it should not appear in their active list.
`
  },
  {
    id: "edu-tasks",
    title: "Practice tasks: submission and review",
    audience: "EDU",
    tags: ["practice", "submission", "review", "grade"],
    content: `
## Solution lifecycle

The student reads the statement, writes code, runs checks, and submits. The teacher opens the attempt, reviews the code and check results, then leaves a grade or feedback.

### Common states

- **Draft** — not submitted yet.
- **In review** — submitted and waiting for a result or teacher review.
- **Accepted** — checks passed.
- **Needs revision** — an error or teacher comment requires attention.
- **Graded** — the learning result is recorded.

If a manual grade locks an attempt, resubmission may remain unavailable until the teacher changes that state.
`
  },
  {
    id: "edu-controlworks",
    title: "Control works: content, timer, and completion",
    audience: "EDU",
    tags: ["control work", "timer", "attempt", "result"],
    content: `
## Control work flow

![Control work stages from preparation to final grade](/docs/control-workflow.svg)

A control work may combine quiz questions, practice tasks, and a time limit.

1. **Prepare** — review contents, rules, and duration.
2. **Active attempt** — the timer follows the work rules.
3. **Finish** — confirm required answers are saved and complete the attempt.
4. **Result** — the system and/or teacher produces the summary.

Do not open parallel attempts in multiple tabs. After a connection issue, return to the control work and verify its current state.
`
  },
  {
    id: "edu-quizzes",
    title: "Quizzes: creation, completion, and review",
    audience: "EDU",
    tags: ["quiz", "questions", "answers", "results"],
    content: `
## For teachers

Create questions, answer options, and the correct answer. Review wording and order before publishing, then use the lesson review to inspect results.

## For students

1. Read the complete question.
2. Select or enter an answer according to its type.
3. Confirm the current choice before moving on.
4. Finish the quiz.

Correct-answer visibility after submission depends on the learning setup. Overall result and attempt status appear in the available review.
`
  },
  {
    id: "edu-gradebook",
    title: "Gradebook: columns, grades, and details",
    audience: "EDU",
    tags: ["gradebook", "columns", "grades", "status"],
    content: `
## Reading the gradebook

![Class gradebook with rows, columns, and summaries explained](/docs/gradebook-guide.svg)

### Interface legend

1. **Student row** groups results for one student in the class.
2. **Practice column** belongs to a specific task.
3. **Control column** shows the corresponding control-work result.
4. **Thematic or summary column** holds an aggregate grade when configured.
5. **Status** distinguishes a missing submission from work still in review.

Select an available grade to open details. An empty cell is not always zero: the attempt may be missing, unfinished, or ungraded.
`
  },
  {
    id: "edu-thematic",
    title: "Thematic and summary grades",
    audience: "EDU",
    tags: ["thematic", "summary", "grading", "configuration"],
    content: `
## Purpose of a thematic grade

A thematic grade summarizes results for a course segment or topic. It is a separate learning record, not another practice task.

Teachers manage gradebook structure and available summary columns in class settings. Review how a configuration change affects existing grades before applying it.

Students see thematic grades separately from individual-work grades.
`
  },
  {
    id: "edu-calendar",
    title: "Calendar and learning dates",
    audience: "EDU",
    tags: ["calendar", "deadlines", "events", "schedule"],
    content: `
## Planning the learning rhythm

The calendar collects available learning events and dates. Use it for the week overview and verify exact rules on the specific work page.

- **Upcoming** — the event or material has not started.
- **Active** — interaction is available now.
- **Due soon** — complete the work shortly.
- **Completed** — the event or work period is over.

Time follows platform and device settings; confirm the exact date and time before a control work.
`
  },
  {
    id: "edu-live",
    title: "Live Classroom: real-time lessons",
    audience: "EDU",
    tags: ["live", "lesson", "shared code", "interaction"],
    content: `
## The live lesson space

![Live Classroom with materials, code, challenge, and question queue](/docs/live-classroom.svg)

Depending on class configuration, a live lesson can include media, lesson materials, a shared code board, quick challenges, and a raised-hand queue.

### Legend

1. **Lesson materials** — context and resources for the meeting.
2. **Live code** — student code or a shared real-time editor.
3. **Challenge** — a short timed task.
4. **Raised hand** — a student request for help.
5. **Class overview** — activity and statuses available to the teacher.

Allow required browser devices and test connectivity before starting. Text and code tools may remain available when media is unavailable, depending on configuration.
`
  },
  {
    id: "edu-appeals",
    title: "Appeals and grade questions",
    audience: "EDU",
    tags: ["appeal", "grade", "explanation", "request"],
    content: `
## When to create an appeal

Use an appeal for a specific question about graded learning work. Use **Support** for a technical platform issue.

### Student

1. Open the work or Appeals area when available.
2. Explain the disagreement concisely.
3. Refer to the statement, solution, or exact feedback.
4. Wait for the teacher response.

### Teacher

Review the work context, give a reasoned response, and close the appeal after resolution. Verify the linked attempt before changing a grade.
`
  },
  {
    id: "edu-import-export",
    title: "Importing and exporting students with CSV",
    audience: "EDU",
    tags: ["CSV", "import", "export", "students"],
    content: `
## Working with a large roster

Export a backup before bulk changes. For import, prepare a UTF-8 CSV and keep required template column names unchanged.

1. Download the current template or export.
2. Fill it without merged cells or hidden rows.
3. Save as UTF-8 CSV.
4. Import and review warnings.
5. Verify the class roster after completion.

Do not include passwords unless StudyCod explicitly provides a protected template for that workflow.
`
  },
  {
    id: "edu-announcements",
    title: "Announcements and class communication",
    audience: "EDU",
    tags: ["announcements", "class", "messages", "email"],
    content: `
## Messages for the whole class

Announcements work well for deadlines, schedule changes, control-work preparation, and short organizational messages.

A useful announcement has:

- one clear subject;
- a concrete student action;
- a date or deadline when relevant;
- a link to the material when available.

Email delivery depends on notification settings. Keep critical information inside the class as well.
`
  },
  {
    id: "grading",
    title: "Grading: automated checks and teacher decisions",
    audience: "ALL",
    tags: ["grading", "automated checks", "12-point scale", "feedback"],
    content: `
## Two different outcomes

A **technical result** tells you whether code passed checks. A **learning grade** records a decision within a lesson or class. In EDU, they can complement each other but are not identical.

- A practice task can have automated tests and a teacher grade.
- A quiz calculates a result according to its setup.
- A control work combines its parts into a summary.
- Thematic and final grades are separate from individual tasks.

StudyCod supports a 12-point learning scale where the corresponding EDU workflow uses it.
`
  },
  {
    id: "faq",
    title: "Frequently asked questions",
    audience: "ALL",
    tags: ["FAQ", "questions", "access", "solutions"],
    content: `
## Why can’t I see a lesson or task?

Confirm you are in the correct class, the material is active, and it is assigned to your account.

## What is the difference between Run and Submit?

Run helps test code while working. Submit records the solution as an attempt for the system or teacher.

## Where is my grade?

In EDU, open the gradebook or the related work details. An automated-check result is not always the final learning grade.

## Where should I report a problem?

Use Appeals for a grade question. Use Support for technical, billing, or account issues.
`
  },
  {
    id: "troubleshooting",
    title: "When something is not working",
    audience: "ALL",
    tags: ["error", "loading", "browser", "support"],
    content: `
## Quick checks

1. Wait for the current loading state to finish.
2. Refresh the page once.
3. Check connectivity and the active account.
4. Retry in a current Chrome, Edge, Firefox, or Safari release.
5. Confirm the deadline and access are still active.

### Include in a support request

- the page and action where the issue happened;
- expected and actual result;
- approximate time;
- a screenshot without passwords or private data;
- the error message, if available.

Create a request on the **Support** page.
`
  },
  {
    id: "privacy",
    title: "Security and privacy",
    audience: "ALL",
    tags: ["security", "privacy", "password", "data"],
    content: `
## Protect your learning account

- Use a unique password and never share it.
- Sign out on shared devices.
- Never place secrets, tokens, or personal data in code, Playground, or public links.
- Verify the recipient before exporting student rosters.
- Change your password and contact Support if you suspect unauthorized access.

Handbook visuals are explanatory mockups. Exact actions can depend on role, plan, and organization settings.
`
  }
];

const DOCS_DETAILS_EN: Partial<Record<DocsSection["id"], string>> = {
  welcome: `
### How the product fits together

Learning content explains the sequence, practice tasks verify a skill, and progress shows the result over time. A successful code run therefore does not always complete a lesson: check the state of the learning item itself.

Continue with the guide for your role, then review Navigation. If you already have an account, confirm the active mode and class before starting.
`,
  "getting-started": `
### Readiness checklist

- email is verified when required;
- the intended programming language is selected;
- your profile name is recognizable to the teacher;
- the correct EDU class is visible;
- the selected theme has comfortable contrast.

Do not create a second account when an invitation is missing. First verify the signed-in email and ask the teacher to check the participant record.
`,
  navigation: `
### A simple way to stay oriented

Before an action, verify the current class, course, or task near the top of the screen. Back returns to the logical parent area, while the product mark returns to the main entry point.

On mobile, open the menu first and then choose a product area. Avoid browser history navigation between steps of an active control work.
`,
  "ux-acceptance": `
### When a state is unclear

Hover or focus the control to reveal available guidance. Read error messages completely: they often include the reason and the next valid action.

Use Tab and Shift+Tab for keyboard navigation, Enter to activate, and Escape to close a dialog. Motion is reduced when the operating system requests reduced motion.
`,
  "profile-progress-model": `
### Interpreting the numbers

Compare progress only within the same period and context. Personal represents practice; EDU represents class learning records. They can move at different speeds and should not be combined into one grade.

For an issued certificate, open its dedicated page and verify the displayed name and identifier before sharing it.
`,
  personal: `
### Choosing difficulty

Move up when you consistently solve the current level without hints. If you cannot formulate a first step after about 15 minutes, review the concept or choose a related easier task.

Balance repetition with unfamiliar problem types. Completed-card count alone is not a reliable measure of a productive learning session.
`,
  "personal-tasks": `
### Common causes of failed checks

- incorrect input or output format;
- extra console text;
- missed empty or boundary values;
- a solution that works only for the example;
- an unintended language or runtime.

Identify the error category first: compilation, runtime, wrong answer, or limit exceeded. This is faster than changing code at random.
`,
  playground: `
### Useful workflow

Reduce an experiment to the smallest example that reproduces the question. Change one thing at a time and run after each logical step. Keep input separate so the run is repeatable.

A shared link can expose the complete code. Remove private values and accidental comments before publishing.
`,
  "edu-student": `
### Before submitting

Confirm the correct work is open, the draft is saved, and the intended code version is in the editor. After Submit, wait for the new state instead of closing the tab immediately.

When a deadline has passed, do not try parallel tabs. Record the actual state and contact the teacher or Support according to the cause.
`,
  "edu-teacher": `
### Before publishing

Review the lesson as a student would: title, goal, materials, action order, completion criterion, and date. Confirm every item is assigned to the intended class.

Afterward, review missing submissions, recurring errors, and inactive students—not only the average grade.
`,
  "edu-classes": `
### Safe roster changes

Check duplicate emails or names before bulk additions. Before removal, verify how historical grades and submissions are retained in your setup.

Roles control access. Grant the minimum role required for the work instead of administrative access for convenience.
`,
  "edu-courses": `
### Course quality check

Each topic should have a clear name, goal, and expected outcome. Split oversized modules into shorter stages so students can see progress.

After applying a template, review dates and access. A template supplies structure, but the class calendar still needs local adjustment.
`,
  "edu-topics": `
### Recommended composition

Start with why the topic matters, then provide an example, guided practice, and independent work. Place optional resources after the core path.

Before assignment, inspect the complete topic for broken links, empty statements, and incorrect ordering.
`,
  "edu-tasks": `
### Useful feedback

Feedback should explain a direction, not only mark an error. Refer to a specific solution fragment or criterion. Provide a complete answer only when independent correction no longer serves the learning goal.

After feedback, students should confirm whether a new attempt is allowed and continue from the latest code version.
`,
  "edu-controlworks": `
### Before and after the attempt

Close unnecessary tabs, prepare a stable connection, and read re-entry rules. Follow the platform timer rather than only the device clock.

After completion, verify the final state. Do not create another attempt after an error without checking the current one.
`,
  "edu-quizzes": `
### Better quiz design

One question should test one idea. Keep answer options consistent in form and avoid accidental hints from grammar or length. Complete the quiz yourself before publishing.

Students should pay attention to negative wording and verify that no required question is unanswered.
`,
  "edu-gradebook": `
### Before editing

Use class and period filters to avoid changing a similar column in another topic. Before a bulk action, verify the work title and several student rows.

After changing a grade, reopen details and confirm the saved value. For a mismatch, include both the work and gradebook views in Support.
`,
  "edu-thematic": `
### Transparency for students

Explain which work contributes to a thematic grade and whether it follows a calculation or teacher judgment. Students must be able to distinguish a missing grade from a final summary.

Avoid duplicate summary columns with nearly identical names.
`,
  "edu-calendar": `
### Working with dates

Leave enough time between publication and deadline. Add a reminder or milestone for larger work when the workflow supports it.

Students should review the week and the next 24 hours separately. Calendar dates must match the actual work availability.
`,
  "edu-live": `
### Preparing a live lesson

Teachers should open materials and challenges in advance, verify access, and define how students ask for help. Students should join early enough to test audio.

When editing shared code, make ownership explicit. Save important work locally before reconnecting after a sync problem.
`,
  "edu-appeals": `
### Writing a useful appeal

Include the work name, exact criterion, relevant solution fragment, and desired review. “The grade is wrong” without context slows down resolution.

Teacher responses should explain the decision. Move technical failures to Support and include a link to the related work.
`,
  "edu-import-export": `
### File check

Inspect the CSV with separators and encoding visible. Keep one student per row and verify required values have not shifted into adjacent columns.

Test with a small roster when possible and preserve the original file as a separate backup.
`,
  "edu-announcements": `
### Tone and structure

The first line should state what changed or what students need to do. Split long explanations and highlight the key date once.

Never publish personal grades or private student data in a class announcement.
`,
  grading: `
### Avoiding confusion

Name the result being discussed: test status, quiz score, manual grade, or thematic summary. Similar numbers in different blocks can have different sources.

Teachers should comment on unusual grades; students should open full work details before appealing.
`,
  faq: `
### Before opening a request

Search the handbook by action name or error text. Check whether the behavior comes from role, deadline, or missing assignment.

Create one support request per issue so its history and status stay clear.
`,
  troubleshooting: `
### What not to do

Do not refresh repeatedly during submission, clear all browser data before saving a draft, or create duplicate requests. These actions can hide the original cause.

If the issue is browser-specific, include its name and version. For Live Classroom, also note device permissions.
`,
  privacy: `
### Student data

Class rosters, grades, exports, and private messages should only be available to people who need them for teaching. Never share CSV files through public links.

Support should not request your password. A safe screenshot, event time, description, and page or work identifier are enough for diagnosis.
`
};

export const DOCS_SECTIONS_EN: DocsSection[] = DOCS_SECTIONS_EN_BASE.map(section => ({
  ...section,
  content: `${section.content.trim()}\n${DOCS_DETAILS_EN[section.id] || ""}`.trim()
}));

export default DOCS_SECTIONS_EN;
