import { describe, expect, it } from "vitest";
import { eduLessonKey, eduLessonPath } from "./eduNavigation";

describe("EDU resource navigation", () => {
  it("keeps coincident course and legacy IDs distinct", () => {
    const topic = { id: 7, type: "TOPIC" as const };
    const course = { id: 7, type: "TOPIC" as const, source: "course" as const };
    expect(eduLessonPath(topic)).toBe("/edu/lessons/7?type=TOPIC");
    expect(eduLessonPath(course)).toBe("/edu/lessons/7?type=TOPIC&source=course");
    expect(eduLessonKey(topic)).not.toBe(eduLessonKey(course));
  });
});
