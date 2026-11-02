---
title: Classwork stays inside its topic and activates when selected live
author: Mykyta
date: 2026-11-02
branch: codex/classwork-inside-topic
id: l-51120470
scope: repo
status: active
src: agent
touches:
  - backend/src/entities/EduLesson.ts
  - backend/src/entities/TopicNew.ts
  - backend/src/routes/edu.ts
  - backend/src/routes/edu/lessonContracts.ts
  - backend/src/routes/edu/lessons.ts
  - backend/src/routes/edu/liveClassroom.ts
  - backend/src/routes/edu/students.ts
  - backend/src/routes/topics.ts
  - frontend/src/components/LessonMaterialsPanel.tsx
  - frontend/src/lib/api/edu.ts
---

## Decided
Keep classwork inside its topic because students and teachers use the topic as the curriculum container. During a live lesson, the teacher activates one work by selecting it in lesson materials because that selection updates the active material for everyone in the session.

## Tried and ruled out
A separate class-level classwork list and creation button were dropped because they make work appear detached from the curriculum and skip the live lesson material picker. A new classwork entity was avoided because the existing MANUAL EduTask submission and review flow already covers students and teachers.

## Watch out
Do not auto-select classwork when a live room starts because the teacher must decide what the class works on. Keep works under their topic, and show one as active only after the teacher selects it.

In the code: EduLesson.topic links to TopicNew; topic pages and student paths render linked work inside the topic; the live classroom picker groups items by topic and uses the existing session lesson selection endpoint.
