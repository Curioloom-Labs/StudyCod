import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { LibraryTaskRevision } from "../entities/LibraryTaskRevision";
import { encodeSnapshot, parseSnapshot, isCompressedSnapshot } from "../utils/revisionSnapshot";
import { logger } from "../utils/logger";

/**
 * One-off, idempotent backfill: gzip-compress legacy plain-JSON snapshots in
 * library_task_revisions (see utils/revisionSnapshot). Safe to re-run — already
 * compressed rows are skipped, and each row is verified to round-trip back to the
 * original object BEFORE the row is written.
 *
 * Usage:
 *   tsx src/scripts/compressRevisionSnapshots.ts            # dry run (default)
 *   tsx src/scripts/compressRevisionSnapshots.ts --apply    # actually write
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(LibraryTaskRevision);

  try {
    const ids: Array<{ id: number }> = await repo
      .createQueryBuilder("r")
      .select("r.id", "id")
      .getRawMany();

    let scanned = 0;
    let alreadyCompressed = 0;
    let converted = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;
    let skippedCorrupt = 0;

    for (const { id } of ids) {
      // Load one row at a time — snapshots are large (tens of MB) and must not all
      // be held in memory at once on a small box.
      const row = await repo.findOne({ where: { id } as any });
      if (!row) continue;
      scanned += 1;
      const original = String(row.snapshot ?? "");
      if (isCompressedSnapshot(original)) { alreadyCompressed += 1; continue; }

      let obj: any;
      try {
        obj = parseSnapshot(original);
      } catch {
        skippedCorrupt += 1;
        logger.warn("[compress-snapshots] skipping unparseable row", { id });
        continue;
      }

      const encoded = encodeSnapshot(obj);
      if (!isCompressedSnapshot(encoded)) continue; // too small to bother

      // Verify round-trip before trusting the new value.
      const verify = JSON.stringify(parseSnapshot(encoded));
      if (verify !== JSON.stringify(obj)) {
        skippedCorrupt += 1;
        logger.error("[compress-snapshots] round-trip mismatch, skipping", { id });
        continue;
      }

      bytesBefore += Buffer.byteLength(original, "utf8");
      bytesAfter += Buffer.byteLength(encoded, "utf8");
      converted += 1;

      if (apply) {
        await repo.update({ id } as any, { snapshot: encoded } as any);
      }
    }

    logger.info("[compress-snapshots] done", {
      mode: apply ? "APPLY" : "DRY-RUN",
      scanned,
      alreadyCompressed,
      converted,
      skippedCorrupt,
      mbBefore: Math.round(bytesBefore / 1048576),
      mbAfter: Math.round(bytesAfter / 1048576),
      mbSaved: Math.round((bytesBefore - bytesAfter) / 1048576),
    });
    if (!apply) logger.info("[compress-snapshots] dry run only — re-run with --apply to write changes");
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: any) => {
  logger.error("[compress-snapshots] failed", { message: error?.message, code: error?.code });
  process.exit(1);
});
