import assert from "node:assert/strict";
import test from "node:test";
import { getPersonalMiniProjectDefinition, PERSONAL_MINI_PROJECT_COUNT, PERSONAL_MINI_PROJECT_INTERVAL } from "./personalMiniProjects";

test("personal mini-project catalog is complete for every supported language", () => {
  assert.equal(PERSONAL_MINI_PROJECT_INTERVAL, 3);

  const keys = new Set<string>();
  for (const language of ["PYTHON", "JAVA", "CPP"] as const) {
    for (let sequence = 0; sequence < PERSONAL_MINI_PROJECT_COUNT; sequence += 1) {
      const project = getPersonalMiniProjectDefinition(language, sequence);
      keys.add(project.key);
      assert.equal(project.language, language);
      assert.equal(project.projectSpec.kind, "MINI_PROJECT");
      assert.equal(project.projectSpec.version, 1);
      assert.ok(project.projectSpec.skills.length >= 3);
      assert.ok(project.projectSpec.milestones.length >= 1);
      assert.equal(project.tests.length, 30);
      assert.equal(project.tests.reduce((sum, item) => sum + item.points, 0), 100);
      assert.ok(project.description.includes("### Формат вводу"));
      assert.ok(project.description.includes("### Формат виводу"));
      assert.ok(project.description.includes("### Важливо"));
      assert.ok(project.template.includes("TODO"));
    }
  }

  assert.equal(keys.size, PERSONAL_MINI_PROJECT_COUNT);
  assert.equal(PERSONAL_MINI_PROJECT_COUNT, 30);
});

test("the first mini-project stays within the early curriculum", () => {
  for (const language of ["PYTHON", "JAVA", "CPP"] as const) {
    const project = getPersonalMiniProjectDefinition(language, 0);
    assert.ok(!project.projectSpec.skills.includes("обробка помилок"));
    assert.ok(!project.description.includes("ділення на нуль"));
    assert.ok(!project.projectSpec.milestones.some((milestone) => /помил|нуль/i.test(milestone.title + milestone.description)));
    assert.ok(!project.tests.some((item) => item.expectedOutput === "ERROR"));
    assert.match(project.description, /10 \/ 2/);
    assert.match(project.description, /5`, а не `5\.0/);
  }
});
