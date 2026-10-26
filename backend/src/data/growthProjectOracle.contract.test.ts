import assert from "node:assert/strict";
import test from "node:test";
import { GROWTH_PROJECT_FAMILIES } from "./growthProjects";
import { runGrowthCardReference, runGrowthProjectReference, type GrowthOracleMutant } from "./growthProjectOracle";

test("semantic reference agrees with every stage example and hidden regression", () => {
  for (const family of GROWTH_PROJECT_FAMILIES) {
    for (const stageKey of ["V1", "V2", "V3"] as const) {
      for (const example of family.stages[stageKey].tests) {
        assert.equal(
          runGrowthProjectReference(family.key, stageKey, example.input),
          example.output,
          `${family.key}/${stageKey}/${example.group}`,
        );
      }
    }
  }
});

test("semantic reference agrees with all defense and transfer cards", () => {
  for (const family of GROWTH_PROJECT_FAMILIES) {
    for (const card of [...family.cards, ...family.transferCards]) {
      for (const example of card.tests) {
        assert.equal(
          runGrowthCardReference(family.key, card.id, example.input),
          example.output,
          `${family.key}/${card.id}/${example.group}`,
        );
      }
    }
  }
});

test("mutation fixtures demonstrate that the catalog catches core regression classes", () => {
  const fixtures: Array<{ family: "contacts" | "inventory" | "logs"; stage: "V1" | "V2" | "V3"; group: string; mutant: GrowthOracleMutant }> = [
    { family: "contacts", stage: "V3", group: "preserve-existing", mutant: "CONTACTS_LAST_WRITE_WINS" },
    { family: "inventory", stage: "V3", group: "rollback", mutant: "INVENTORY_PARTIAL_BATCH" },
    { family: "logs", stage: "V3", group: "deduplicate", mutant: "LOGS_IGNORE_UNIQUE" },
  ];

  for (const fixture of fixtures) {
    const family = GROWTH_PROJECT_FAMILIES.find(item => item.key === fixture.family)!;
    const example = family.stages[fixture.stage].tests.find(item => item.group === fixture.group)!;
    const correct = runGrowthProjectReference(fixture.family, fixture.stage, example.input);
    const mutated = runGrowthProjectReference(fixture.family, fixture.stage, example.input, fixture.mutant);
    assert.equal(correct, example.output, `${fixture.family}/${fixture.group} baseline`);
    assert.notEqual(mutated, example.output, `${fixture.family}/${fixture.group} must reject the mutant`);
  }
});
