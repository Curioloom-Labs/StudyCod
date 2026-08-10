import assert from "node:assert/strict";
import test from "node:test";
import { getPersonalMiniProjectDefinition, PERSONAL_MINI_PROJECT_INTERVAL } from "./personalMiniProjects";

test("personal mini-project catalog is complete for every supported language", () => {
  assert.equal(PERSONAL_MINI_PROJECT_INTERVAL, 3);

  const keys = new Set<string>();
  for (const language of ["PYTHON", "JAVA", "CPP"] as const) {
    for (let sequence = 0; sequence < 22; sequence += 1) {
      const project = getPersonalMiniProjectDefinition(language, sequence);
      keys.add(project.key);
      assert.equal(project.language, language);
      assert.equal(project.projectSpec.kind, "MINI_PROJECT");
      assert.equal(project.projectSpec.version, 1);
      assert.ok(project.projectSpec.skills.length >= 3);
      assert.ok(project.projectSpec.milestones.length >= 1);
      assert.ok(project.tests.length >= 4);
      assert.equal(project.tests.reduce((sum, item) => sum + item.points, 0), 100);
      assert.ok(project.template.includes("TODO"));
    }
  }

  assert.equal(keys.size, 22);
});
