import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { prisma } from '@/lib/db/prisma';
import { recordAudit } from '@/lib/services/audit';
import type { SessionUser } from '@/lib/auth/guards';
import { sanitiseError } from './config';
import { backupStorage } from './storage';
import { checksumFile, checksumMatches, CHECKSUM_FAILED_MESSAGE } from './checksum.service';
import { readArchiveEntry, extractArchive } from './archive';
import { ARCHIVE_PATHS, readManifest } from './manifest';
import { restoreDatabase, verifyDumpArchive } from './database-backup.service';
import { restoreMedia, removeStaging } from './media-restore.service';
import { createBackup } from './backup.service';
import { withBackupLock } from './lock.service';
import { setMaintenanceMode } from './maintenance';
import { runBackfill } from '@/lib/urls/backfill';

/**
 * Restoring a backup.
 *
 * Ordered so that every destructive step is preceded by something that can
 * still abort safely:
 *
 *   1. take a safety backup of the current site — abort if it fails
 *   2. download the archive and verify its SHA-256 — abort on mismatch
 *   3. verify the dump is a readable pg_dump archive — abort if not
 *   4. enter maintenance mode
 *   5. restore the database inside a single transaction
 *   6. restore media
 *   7. leave maintenance mode (in `finally`, so a crash still lifts it)
 *
 * The safety backup is never deleted by this flow, including when the restore
 * fails — it is the only way back.
 */

export type RestoreResult = {
  restoreId: string;
  safetyBackupId: string;
  mediaRestored: number;
  skippedPaths: string[];
};

export async function restoreFromBackup(
  backupId: string,
  actor: SessionUser | null,
): Promise<RestoreResult> {
  return withBackupLock(() => runRestore(backupId, actor), 'RESTORE');
}

async function runRestore(backupId: string, actor: SessionUser | null): Promise<RestoreResult> {
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error('That backup no longer exists.');
  if (backup.status !== 'COMPLETED') {
    throw new Error('Only a completed backup can be restored.');
  }
  if (!backup.storageKey) throw new Error('That backup has no archive in storage.');

  const restore = await prisma.backupRestore.create({
    data: { backupId, status: 'RUNNING', restoredById: actor?.id ?? null },
  });

  await recordAudit({
    actor,
    action: 'RESTORE_STARTED',
    entity: 'Backup',
    entityId: backupId,
    summary: `Restore started from ${backup.fileName ?? backupId}`,
  });

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'restore-'));
  let maintenanceEngaged = false;
  let safetyBackupId = '';

  try {
    // ---- 1. Safety backup. Mandatory: no rollback point, no restore. -------
    const safety = await createBackup({
      type: 'FULL',
      origin: 'SAFETY',
      actor,
      assumeLocked: true, // the restore already holds the lock
    });

    if (safety.status !== 'COMPLETED') {
      throw new Error(
        `The pre-restore safety backup failed, so the restore was cancelled and nothing was changed. ${safety.errorMessage ?? ''}`.trim(),
      );
    }
    safetyBackupId = safety.id;
    await prisma.backupRestore.update({
      where: { id: restore.id },
      data: { safetyBackupId },
    });

    // ---- 2. Fetch and verify integrity ------------------------------------
    const archivePath = path.join(workDir, backup.fileName ?? 'backup.zip');
    await pipeline(
      await backupStorage().download(backup.storageKey),
      fs.createWriteStream(archivePath),
    );

    if (backup.checksum) {
      const actual = await checksumFile(archivePath);
      if (!checksumMatches(backup.checksum, actual)) {
        throw new Error(CHECKSUM_FAILED_MESSAGE);
      }
    }

    // ---- 3. Validate the manifest before touching anything -----------------
    const manifestRaw = await readArchiveEntry(archivePath, ARCHIVE_PATHS.manifest);
    if (!manifestRaw) throw new Error('That archive does not contain a manifest.json.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestRaw);
    } catch {
      throw new Error('That archive does not contain a valid manifest.json.');
    }

    const manifestCheck = readManifest(parsed);
    if (!manifestCheck.ok) throw new Error(manifestCheck.error);
    const manifest = manifestCheck.manifest;

    // ---- 4. Maintenance mode ----------------------------------------------
    await setMaintenanceMode(true);
    maintenanceEngaged = true;

    await prisma.backup.update({ where: { id: backupId }, data: { status: 'RESTORING' } });

    // ---- 5. Database -------------------------------------------------------
    //
    // A database restore replaces every table, including the backup inventory
    // itself. Left alone, restoring a week-old backup would erase all newer
    // Backup rows — the safety backup among them — leaving the admin unable to
    // see or roll back to the state they just left. The archives are still in
    // storage, so the inventory is captured here and merged back afterwards.
    const inventory = await prisma.backup.findMany();
    const restoreHistory = await prisma.backupRestore.findMany();

    if (manifest.databaseIncluded) {
      await extractArchive(archivePath, workDir, {
        filter: (entryPath) => entryPath === ARCHIVE_PATHS.databaseDump,
      });
      const dumpPath = path.join(workDir, ARCHIVE_PATHS.databaseDump);

      // The dump's own checksum, recorded when the backup was taken.
      if (manifest.checksum) {
        const dumpChecksum = await checksumFile(dumpPath);
        if (!checksumMatches(manifest.checksum, dumpChecksum)) {
          throw new Error(CHECKSUM_FAILED_MESSAGE);
        }
      }

      if (!(await verifyDumpArchive(dumpPath))) {
        throw new Error('That archive does not contain a readable database dump.');
      }

      await restoreDatabase(dumpPath);

      // The snapshot's own lock row is meaningless now and would block every
      // future operation, so it goes first.
      await prisma.backupLock.deleteMany({}).catch(() => undefined);

      // Re-insert anything the snapshot did not know about. skipDuplicates
      // leaves rows the backup already contained exactly as restored.
      await prisma.backup
        .createMany({ data: inventory, skipDuplicates: true })
        .catch((error) => console.error('[backup] inventory merge failed', sanitiseError(error)));
      await prisma.backupRestore
        .createMany({ data: restoreHistory, skipDuplicates: true })
        .catch((error) => console.error('[backup] restore history merge failed', sanitiseError(error)));

      // The URL registry is part of the dump, but a backup taken before it
      // existed — or content restored without its routes — would leave the
      // two out of step. Re-registering is idempotent and never moves a
      // public address, so the restored site resolves exactly its content.
      await runBackfill(actor ? { id: actor.id, email: actor.email } : null).catch((error) =>
        console.error('[backup] URL registry reconcile failed', sanitiseError(error)),
      );
    }

    // ---- 6. Media ----------------------------------------------------------
    let mediaRestored = 0;
    let skippedPaths: string[] = [];
    if (manifest.mediaIncluded) {
      const stagingDir = path.join(workDir, 'media-staging');
      const result = await restoreMedia(archivePath, stagingDir);
      mediaRestored = result.restored;
      skippedPaths = result.skipped;
      await removeStaging(stagingDir);
    }

    // This row was created before the dump was taken, so the restored database
    // may not contain it. Upsert rather than update so the record of the
    // restore that just happened is present either way.
    await prisma.backupRestore
      .upsert({
        where: { id: restore.id },
        update: { status: 'COMPLETED', completedAt: new Date() },
        create: {
          id: restore.id,
          backupId,
          safetyBackupId,
          status: 'COMPLETED',
          startedAt: restore.startedAt,
          completedAt: new Date(),
          restoredById: actor?.id ?? null,
        },
      })
      .catch(() => undefined);

    await prisma.backup
      .update({ where: { id: backupId }, data: { status: 'COMPLETED' } })
      .catch(() => undefined);

    await recordAudit({
      actor,
      action: 'RESTORE_COMPLETED',
      entity: 'Backup',
      entityId: backupId,
      summary:
        `Restore completed from ${backup.fileName ?? backupId}. ` +
        `${manifest.databaseIncluded ? 'Database restored. ' : ''}` +
        `${manifest.mediaIncluded ? `${mediaRestored} media file(s) restored. ` : ''}` +
        `Safety backup ${safetyBackupId} retained.`,
    });

    return { restoreId: restore.id, safetyBackupId, mediaRestored, skippedPaths };
  } catch (error) {
    const message = sanitiseError(error);

    await prisma.backupRestore
      .update({
        where: { id: restore.id },
        data: { status: 'FAILED', failedAt: new Date(), errorMessage: message },
      })
      .catch(() => undefined);

    await prisma.backup
      .update({ where: { id: backupId }, data: { status: 'COMPLETED' } })
      .catch(() => undefined);

    await recordAudit({
      actor,
      action: 'RESTORE_FAILED',
      entity: 'Backup',
      entityId: backupId,
      summary:
        `Restore failed from ${backup.fileName ?? backupId}: ${message}` +
        (safetyBackupId ? ` Safety backup ${safetyBackupId} is retained and can be restored.` : ''),
    });

    throw new Error(message);
  } finally {
    // The site must never be left in maintenance mode because a restore threw.
    if (maintenanceEngaged) {
      await setMaintenanceMode(false).catch(() => undefined);
    }
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
