import assert from "node:assert/strict";
import test from "node:test";
import { loadCurriculumMiniProjects, loadCurriculumTopics, validateCurriculum } from "./curriculum";

test("curriculum manifest is valid and every course has theory", () => {
  const result = validateCurriculum();
  assert.equal(result.manifest.version, 1);
  assert.ok(result.manifest.courses.length >= 9);
  for (const course of result.manifest.courses) {
    assert.ok(result.topics[course.key]?.length, course.key);
    assert.equal(new Set(result.topics[course.key].map((topic) => topic.key)).size, result.topics[course.key].length);
  }
});

test("authored theory has the learner-facing contract and generated exercise focus", () => {
  const result = validateCurriculum();
  const requiredSections = [
    /###\s+(Інтуїтивне пояснення|Інтуїтивна модель)/i,
    /###\s+(Що відбувається під час виконання|Як це працює)/i,
    /###\s+Мінімальний приклад коду[\s\S]*```/i,
    /###\s+(Пояснення кожного рядка прикладу|Пояснення фрагмента|Пояснення)/i,
    /###\s+Типові помилки/i,
    /###\s+На практиці/i,
    /###\s+Підсумок/i,
  ];

  for (const course of result.manifest.courses) {
    for (const topic of result.topics[course.key]) {
      for (const section of requiredSections) assert.match(topic.content, section, `${course.key}/${topic.key}`);
      assert.ok(topic.exerciseFocus.length >= 20, `${course.key}/${topic.key} exerciseFocus`);
      assert.doesNotMatch(topic.content, /STUDYCOD_LEARNING_META|exercise_focus:/i, `${course.key}/${topic.key} metadata leaked into theory`);
      assert.ok(topic.content.length >= 1400, `${course.key}/${topic.key} is too short`);
    }
  }
});

test("topic identity stays stable when the same source is loaded twice", () => {
  const course = validateCurriculum().manifest.courses.find((entry) => entry.key === "python-core")!;
  const first = loadCurriculumTopics(course);
  const second = loadCurriculumTopics(course);
  assert.deepEqual(first.map((topic) => [topic.key, topic.sourceHash]), second.map((topic) => [topic.key, topic.sourceHash]));
});

test("specialised lessons are authored lessons, not padded generic notes", () => {
  const result = validateCurriculum();
  for (const courseKey of ["flask", "fastapi", "computer-vision"]) {
    for (const topic of result.topics[courseKey]) {
      assert.ok(topic.content.length >= 2400, `${courseKey}/${topic.key}`);
      assert.ok((topic.content.match(/^### /gm) || []).length >= 10, `${courseKey}/${topic.key}`);
      assert.match(topic.content, /```interactive\s*\n\{"type":"prediction"/i, `${courseKey}/${topic.key}`);
      assert.match(topic.content, /\*\*Навіщо саме(?: це)?/i, `${courseKey}/${topic.key}`);
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, `${courseKey}/${topic.key}`);
    }
  }
  for (const topic of result.topics["python-extensions"]) {
    assert.ok(topic.content.length >= 2600, `python-extensions/${topic.key}`);
  }
});

test("FastAPI is a complete course and every specialization exposes an integration project", () => {
  const result = validateCurriculum();
  assert.ok(result.topics.fastapi.length >= 24, "FastAPI needs a complete progression, not a short overview");
  assert.match(result.topics.fastapi[0].title, /Вступ|HTTP|ASGI/i);
  for (const course of result.manifest.courses.filter((entry) => !entry.isBase)) {
    const projects = loadCurriculumMiniProjects(course.key);
    assert.ok(projects.length >= 1, `${course.key} must expose a mini-project`);
    for (const project of projects) {
      assert.ok(project.skills.length >= 2, `${course.key}/${project.key} skills`);
      assert.ok(project.milestones.length >= 1, `${course.key}/${project.key} milestones`);
      assert.ok(project.acceptanceCriteria.length >= 1, `${course.key}/${project.key} acceptance`);
    }
  }
});

test("every specialization has a full lesson shape without template blocks", () => {
  const result = validateCurriculum();
  for (const courseKey of ["python-extensions", "flask", "fastapi", "computer-vision", "java-advanced", "cpp-advanced"]) {
    for (const topic of result.topics[courseKey]) {
      const minimumHeadings = ["flask", "fastapi", "computer-vision"].includes(courseKey) ? 10 : 8;
      assert.ok((topic.content.match(/^### /gm) || []).length >= minimumHeadings, `${courseKey}/${topic.key} needs a complete lesson shape`);
      assert.match(topic.content, /###\s+На практиці/i, `${courseKey}/${topic.key} needs a practical explanation`);
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, `${courseKey}/${topic.key} contains a template block`);
    }
  }
});

test("no theory file contains the removed template headings", () => {
  const result = validateCurriculum();
  for (const topics of Object.values(result.topics)) {
    for (const topic of topics) {
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, topic.title);
    }
  }
});
