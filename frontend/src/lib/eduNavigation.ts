import type { Lesson } from "./api/edu";

/** Topic, control-work and course-lesson IDs belong to separate tables. */
export function eduLessonPath(lesson: Pick<Lesson, "id" | "type" | "source">): string {
  const query = new URLSearchParams({ type: lesson.type });
  if (lesson.source) query.set("source", lesson.source);
  return `/edu/lessons/${lesson.id}?${query}`;
}

export function eduLessonKey(lesson: Pick<Lesson, "id" | "type" | "source">): string {
  return `${lesson.source || (lesson.type === "LESSON" ? "course" : "legacy")}:${lesson.type}:${lesson.id}`;
}
