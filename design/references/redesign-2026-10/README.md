# StudyCod redesign references · 2026-10

This directory contains 29 separate image references: one brand board, six landing sections, twelve desktop workspaces, and ten mobile views. They were generated for this redesign and reviewed as a set before implementation. They set the composition, information order, density, and responsive behavior; their sample text, logo renderings, metrics, names, and colors are not product truth. Use the shipped logo component, Fixel fonts, semantic colors, and real API data in the application.

## Brand and public landing

| Image | Composition rule |
|---|---|
| [Brand board](brandboard.webp) | Keep the genuine StudyCod logo, Fixel, and approved dark/light tokens; use green for actions and progress. |
| [01 · Promise](landing-01-promise.webp) | A short promise beside a product demonstration, with one primary action. |
| [02 · Learning loop](landing-02-learning-loop.webp) | Show code, a test result, a useful hint, and the next attempt as one readable sequence. |
| [03 · Course route](landing-03-course-path.webp) | Explain how a learner moves through a real course without duplicating course cards. |
| [04 · Teacher workflow](landing-04-teacher-workflow.webp) | Show the teacher’s review queue and the evidence behind a next action. |
| [05 · Contests](landing-05-contests.webp) | Make event status, tasks, and standings legible in the same product language. |
| [06 · Final action](landing-06-final-action.webp) | Close the public page with a direct next step, not a second competing pitch. |

## Desktop workspaces

| Image | Target screen |
|---|---|
| [Learner dashboard](desktop-learning-dashboard.webp) | Next lesson, course route, and results. |
| [Learning catalog](desktop-learning-catalog.webp) | Searchable courses and clear enrollment prerequisites. |
| [Course path](desktop-course-path.webp) | Sequential modules with current and completed states. |
| [Task library](desktop-task-library.webp) | Search, filters, result count, and a compact task list. |
| [IDE](desktop-ide.webp) | Condition, code, and result panes with stable primary actions. |
| [Teacher dashboard](desktop-teacher-dashboard.webp) | Review queue first; classes and upcoming work next. |
| [Student dashboard](desktop-student-dashboard.webp) | Upcoming work, deadlines, and feedback. |
| [Gradebook](desktop-gradebook.webp) | Semantic table, aligned numbers, and clear student identity. |
| [Contest list](desktop-contest-list.webp) | Active, upcoming, and finished events. |
| [Contest detail](desktop-contest-detail.webp) | Event status and action before tasks and announcements. |
| [Scoreboard](desktop-scoreboard.webp) | Compact status and filters above a dense table. |
| [Administration](desktop-admin.webp) | Attention states and administrative actions before secondary metrics. |

## Mobile workspaces

| Image | Target screen |
|---|---|
| [Learner dashboard](mobile-learning-dashboard.webp) | Continue action, progress, and course route. |
| [Learning catalog](mobile-learning-catalog.webp) | Readable course list and enrollment actions. |
| [Task library](mobile-task-library.webp) | Search first; filters open separately from results. |
| [Student dashboard](mobile-student-dashboard.webp) | Next task, deadlines, and teacher feedback. |
| [Teacher review](mobile-teacher-review.webp) | Submitted work, rubric, grade, and feedback in order. |
| [Contest detail](mobile-contest-detail.webp) | Status, tasks, and announcements. |
| [Scoreboard](mobile-scoreboard.webp) | Aligned standings with a direct jump to the learner’s row. |
| [IDE · condition](mobile-ide-condition.webp) | Condition tab with a clear path to Code. |
| [IDE · code](mobile-ide-code.webp) | Editor kept visible with Run and Submit. |
| [IDE · result](mobile-ide-result.webp) | Test outcome and readable test details with a path back to Code. |

## Implementation notes from visual review

- Desktop navigation stays in the header. Mobile sections open from the same top header; no left rail or bottom global navigation.
- A page heading is compact and task-specific. The main action sits beside it, while detailed content starts immediately below.
- Lists and tables carry the work. A card is reserved for a distinct item or action, not for every block of content.
- The mobile library reference demonstrates an independent filter surface. The IDE references are three states of one retained workspace, not three separate editors.
- Some generated boards vary language, theme, logo details, and sample values. These are composition samples only. Keep actual Ukrainian/English localization, the original brand assets, and production data in code.
