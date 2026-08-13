import { validateCurriculum } from "../utils/curriculum";

try {
  const result = validateCurriculum();
  console.log(JSON.stringify({ manifestVersion: result.manifest.version, manifestHash: result.manifestHash, courses: Object.fromEntries(Object.entries(result.topics).map(([key, topics]) => [key, topics.length])) }, null, 2));
} catch (error: any) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
