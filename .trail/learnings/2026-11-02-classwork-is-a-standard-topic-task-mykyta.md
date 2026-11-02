---
title: Classwork is a standard topic task type
author: Mykyta
date: 2026-11-02
branch: codex/classwork-inside-topic
id: l-a80cadea
scope: repo
status: active
replaces: l-51120470
src: agent
touches:
  - backend/src/entities/EduLiveSession.ts
  - backend/src/entities/TopicTask.ts
  - backend/src/routes/edu.ts
  - backend/src/routes/edu/gradebook.ts
  - backend/src/routes/edu/insights.ts
  - backend/src/routes/edu/lessons.ts
  - backend/src/routes/edu/liveClassroom.ts
  - backend/src/routes/edu/students.ts
  - backend/src/routes/topicContracts.ts
  - backend/src/routes/topics.ts
---

## Decided
Create classwork through the regular “Add task” flow as a standard TopicTask with type CLASSWORK. It keeps the normal task editor, student submission, tests, and grading. Teachers activate it for the class by selecting it in live lesson materials.

## Tried and ruled out
A separate classwork composer, classwork-only entity, or manual EduLesson workflow duplicates the task system and detaches creation from the topic. The user explicitly corrected that design.

## Watch out
Every student, gradebook, agenda, and lesson query that filters on PRACTICE must also include CLASSWORK where ordinary tasks are expected. Live session selection must distinguish lesson IDs from task IDs and assign the selected classwork to the whole class.

In the code:
- frontend/src/pages/edu/TopicStudioPage.tsx: standard editor exposes PRACTICE/CLASSWORK for class topics.
- backend/src/entities/TopicTask.ts: CLASSWORK task type.
- backend/src/routes/edu/liveClassroom.ts and frontend/src/components/LessonMaterialsPanel.tsx: live selection and activation.
- backend/src/routes/edu/students.ts, backend/src/routes/edu/gradebook.ts, backend/src/services/edu/agenda.ts: student access and ordinary grading views.
