import { GROWTH_PROJECT_FAMILIES, validateGrowthProjectCatalog } from "../data/growthProjects";

const errors = validateGrowthProjectCatalog();
if (errors.length) {
  console.error("Growth project catalogue validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${GROWTH_PROJECT_FAMILIES.length} families, 9 runtime tracks, and ${GROWTH_PROJECT_FAMILIES.reduce((count, family) => count + Object.keys(family.stages).length, 0)} stage contracts.`);
}
