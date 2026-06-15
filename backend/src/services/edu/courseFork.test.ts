import test from "node:test";
import assert from "node:assert/strict";
import { planForkFromCourse, hashCourseItem } from "./courseFork";

function course(modules: any[]): any {
  return { modules };
}

test("planForkFromCourse maps a module to a lesson with tasks, theory and quiz", () => {
  const plan = planForkFromCourse(
    course([
      {
        id: 1,
        title: "Module A",
        items: [
          { id: 10, kind: "THEORY", title: "Intro", content: { html: "<p>hi</p>" } },
          { id: 11, kind: "CODE_TASK", title: "Sum", content: { description: "add", template: "def f():" } },
          { id: 12, kind: "WEB_TASK", title: "Page", content: { description: "build", template: "" } },
          { id: 13, kind: "QUIZ", title: "Check", content: { quiz: { q: 1 } } }
        ]
      }
    ])
  );

  assert.equal(plan.lessons.length, 1);
  const lesson = plan.lessons[0];
  assert.equal(lesson.title, "Module A");
  assert.match(lesson.theory ?? "", /Intro/);
  assert.match(lesson.theory ?? "", /<p>hi<\/p>/);
  assert.equal(lesson.tasks.length, 2);
  assert.equal(lesson.tasks[0].taskMode, "CODE");
  assert.equal(lesson.tasks[1].taskMode, "WEB");
  assert.equal(lesson.quizJson, JSON.stringify({ q: 1 }));
  assert.equal(plan.skipped.length, 0);
});

test("planForkFromCourse maps a MANUAL item to a manual task", () => {
  const plan = planForkFromCourse(
    course([{ id: 2, title: "M", items: [{ id: 20, kind: "MANUAL", title: "Essay", content: { description: "write" } }] }])
  );
  assert.equal(plan.lessons[0].tasks.length, 1);
  assert.equal(plan.lessons[0].tasks[0].taskMode, "MANUAL");
  assert.equal(plan.lessons[0].tasks[0].title, "Essay");
  assert.deepEqual(plan.skipped, []);
});

test("planForkFromCourse preserves module order and source ids for origin tracking", () => {
  const plan = planForkFromCourse(
    course([
      { id: 1, title: "First", items: [{ id: 10, kind: "CODE_TASK", title: "T1", content: {} }] },
      { id: 2, title: "Second", items: [{ id: 20, kind: "CODE_TASK", title: "T2", content: {} }] }
    ])
  );
  assert.deepEqual(
    plan.lessons.map((l) => l.title),
    ["First", "Second"]
  );
  assert.equal(plan.lessons[0].tasks[0].sourceItemId, 10);
  assert.equal(plan.lessons[1].tasks[0].sourceItemId, 20);
});

test("hashCourseItem is stable across key order and changes with content", () => {
  const a = hashCourseItem({ kind: "CODE_TASK", title: "T", content: { x: 1, y: 2 } } as any);
  const b = hashCourseItem({ kind: "CODE_TASK", title: "T", content: { y: 2, x: 1 } } as any);
  assert.equal(a, b, "key order does not change the hash");

  const c = hashCourseItem({ kind: "CODE_TASK", title: "T", content: { x: 9, y: 2 } } as any);
  assert.notEqual(a, c, "different content yields a different hash");
});

test("planForkFromCourse handles an empty course", () => {
  const plan = planForkFromCourse(course([]));
  assert.deepEqual(plan.lessons, []);
  assert.deepEqual(plan.skipped, []);
});
