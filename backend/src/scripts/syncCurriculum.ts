import { AppDataSource } from "../data-source";
import { syncCurriculum } from "../services/curriculumSyncService";
import { validateCurriculum } from "../utils/curriculum";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const theoryOnly = process.argv.includes("--theory-only");
  if (dryRun) {
    const { manifest, manifestHash, topics } = validateCurriculum();
    console.log(JSON.stringify({
      dryRun: true,
      theoryOnly,
      manifestHash,
      courses: manifest.courses.map((course) => ({ key: course.key, topics: topics[course.key]?.length || 0 })),
    }, null, 2));
    return;
  }
  await AppDataSource.initialize();
  try {
    console.log(JSON.stringify(await syncCurriculum({ theoryOnly }), null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
