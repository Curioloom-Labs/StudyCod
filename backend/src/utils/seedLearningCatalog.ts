import { syncCurriculum } from "../services/curriculumSyncService";

/**
 * Backward-compatible startup hook. The actual importer is the versioned,
 * idempotent curriculum sync service; startup never contains a second copy of
 * course theory or fallback content.
 */
export async function seedLearningCatalogContent(): Promise<void> {
  // Theory is authored content. Practice remains owned by the existing
  // post-reading generation pipeline and must not be rewritten during startup.
  await syncCurriculum({ theoryOnly: true });
}
