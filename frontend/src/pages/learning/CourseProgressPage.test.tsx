import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningCourse } from "../../lib/api/learningCatalog";

const learning = vi.hoisted(() => ({
  state: { currentCourse: null as LearningCourse | null, loading: false, error: null as string | null, refresh: vi.fn() },
}));

vi.mock("../../components/learning/PersonalLearningProvider", () => ({
  usePersonalLearning: () => learning.state,
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: () => ({ i18n: { language: "uk" } }),
}));

import { CourseProgressPage } from "./CourseProgressPage";
import { getLearningPreviewCourse } from "../../lib/learningPreview";

function renderProgress() {
  return renderToStaticMarkup(<MemoryRouter><CourseProgressPage /></MemoryRouter>);
}

describe("course progress without a current course", () => {
  beforeEach(() => {
    learning.state.loading = false;
    learning.state.error = null;
    learning.state.currentCourse = null;
  });

  it("shows a loading status while the first request is pending", () => {
    learning.state.loading = true;
    expect(renderProgress()).toContain("Завантажуємо прогрес");
  });

  it("offers a retry after a failed request instead of loading indefinitely", () => {
    learning.state.error = "network error";
    const html = renderProgress();
    expect(html).toContain("Не вдалося завантажити прогрес");
    expect(html).toContain("Спробувати ще");
    expect(html).not.toContain("Завантажуємо прогрес");
  });

  it("offers the catalog when no course has been selected", () => {
    const html = renderProgress();
    expect(html).toContain("Оберіть курс, щоб переглянути прогрес");
    expect(html).toContain('href="/learning/catalog"');
  });

  it("keeps existing progress visible and offers a retry after refresh fails", () => {
    learning.state.currentCourse = getLearningPreviewCourse(601);
    learning.state.error = "network error";
    const html = renderProgress();
    expect(html).toContain("Показано останні завантажені дані");
    expect(html).toContain("Прогрес курсу");
    expect(html).toContain("Повторити");
  });
});
