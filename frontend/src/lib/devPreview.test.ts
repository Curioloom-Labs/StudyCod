import { afterEach, describe, expect, it, vi } from "vitest";
import { getDevPreviewUser, withDevPreview } from "./devPreview";
import { completeLearningPreviewItem, getLearningPreviewCatalog, getLearningPreviewCourse, getLearningPreviewMe } from "./learningPreview";

describe("development preview routes and fixtures", () => {
  it("preserves the preview persona, route query, and fragment", () => {
    expect(withDevPreview("/edu/classes/31/gradebook?tab=summary#student-201", "?preview=true&persona=teacher"))
      .toBe("/edu/classes/31/gradebook?tab=summary&preview=true&persona=teacher#student-201");
  });

  it("creates a stable student persona with an educational class context", () => {
    const user = getDevPreviewUser("?preview=true&persona=student");
    expect(user.role).toBe("TEACHER");
    expect(user.studentId).toBe(1);
    expect(user.classId).toBe(31);
  });

  it("keeps the demo catalog, route item, and IDE task on the same learning scenario", () => {
    const catalog = getLearningPreviewCatalog();
    const course = getLearningPreviewCourse(601);
    const item = course.modules.flatMap((module) => module.items).find((entry) => entry.id === 6102);

    expect(catalog).toHaveLength(3);
    expect(item?.title).toBe("Розумний розклад автобусів");
    expect(item?.content.statement).toContain("автобуса");
    expect(course.nextAction?.itemId).toBe(6102);
  });

  it("unlocks the next course item only after the current one is completed", () => {
    completeLearningPreviewItem(6102);
    expect(getLearningPreviewCourse(601).nextAction?.itemId).toBe(6103);
    expect(getLearningPreviewMe().current?.completionPercent).toBe(50);
  });

  it("keeps demo learning progress after a full route reload", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    });
    vi.resetModules();

    const firstLoad = await import("./learningPreview");
    firstLoad.enrollLearningPreviewCourse(601);
    firstLoad.completeLearningPreviewItem(6102);
    expect(firstLoad.getLearningPreviewCourse(601).enrollment.completionPercent).toBe(50);

    vi.resetModules();
    const afterNavigation = await import("./learningPreview");
    expect(afterNavigation.getLearningPreviewCourse(601).enrollment.completionPercent).toBe(50);
    expect(afterNavigation.getLearningPreviewCourse(601).nextAction?.itemId).toBe(6103);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
