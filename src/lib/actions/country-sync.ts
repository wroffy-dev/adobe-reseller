'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { getCountryById, getDefaultCountry } from '@/lib/country/registry';
import { runCountrySync, type SyncResult } from '@/lib/country/sync';
import { claimSyncRun } from '@/lib/country/sync-lock';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { Prisma } from '@prisma/client';
import { syncContentRoutes, actorOf } from '@/lib/urls/registry';

/**
 * There is no `mode`, and no `sourceCountryId`.
 *
 * The source is the default market, read from the database on every call: "sync
 * from India" is a statement about which market is the root, and letting the
 * browser name a source would make this a way to copy any market over any
 * other — UAE over India, or one market over its neighbour.
 *
 * `mode` is gone because there is only one behaviour. An "update existing" mode
 * would overwrite whatever the destination market had changed since importing,
 * which is the destination's own work; there is no version of that worth
 * offering an administrator.
 */
const schema = z.object({
  targetCountryId: z.string().min(1),
  previewOnly: z.coerce.boolean().default(false),
});

/**
 * Copies the default market's content into another market.
 *
 * The source is always the default market, read from the database rather than
 * taken from the caller: "sync from India" is a statement about which market is
 * the root, and letting the browser name a source would make it a way to copy
 * any market over any other.
 *
 * Concurrency is held off by the run row itself. A second sync into the same
 * market while one is running would race the mapping table and could produce
 * the duplicate the mapping exists to prevent, so it is refused rather than
 * queued — the administrator can see the run in progress and wait for it.
 */
export async function syncCountryContent(input: unknown): Promise<ActionResult<SyncResult & { runId: string | null }>> {
  try {
    const user = await authorize('settings.manage');
    const { targetCountryId, previewOnly } = schema.parse(input);

    const [source, target] = await Promise.all([
      getDefaultCountry(),
      getCountryById(targetCountryId),
    ]);
    if (!target) return failure('That country no longer exists.');
    if (target.id === source.id) {
      return failure(`${source.name} is the source market — there is nothing to copy into it.`);
    }

    // A preview writes nothing, so it neither takes the lock nor records a run.
    if (previewOnly) {
      const result = await runCountrySync({ source, target, previewOnly: true });
      return success({ ...result, runId: null });
    }

    /*
     * Checking for a running sync and starting one are a single atomic claim,
     * held against the destination market alone — so two administrators cannot
     * both start a sync into the UAE, while India → UAE and India → Qatar still
     * run side by side.
     */
    const claim = await claimSyncRun({
      sourceCountryId: source.id,
      targetCountryId: target.id,
      startedById: user.id,
    });
    if ('busy' in claim) {
      return failure(
        `A sync into ${target.name} is already running. Wait for it to finish before starting another.`,
      );
    }
    const run = { id: claim.runId };

    try {
      const result = await runCountrySync({ source, target, previewOnly: false });

      await prisma.countrySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          createdCount: result.created,
          updatedCount: 0,
          // Content the market removed on purpose is counted with the skips in
          // the stored totals, and kept apart in the log where the reason is.
          skippedCount: result.skipped + result.deletedLocally,
          conflictCount: result.conflicts,
          failedCount: result.failed,
          log: result.log as unknown as Prisma.InputJsonValue,
        },
      });

      /*
       * One line per run, for whoever is reading container logs rather than the
       * admin screen. Counts and codes only: no lead details, no addresses, no
       * credentials — none of which this touches, and none of which should ever
       * reach a log line because a sync happened to run.
       */
      console.info(
        `[country-sync] source=${source.code} target=${target.code} ` +
          `created=${result.created} skipped=${result.skipped} ` +
          `locally_deleted=${result.deletedLocally} conflicts=${result.conflicts} ` +
          `failed=${result.failed} ` +
          Object.entries(result.breakdown)
            .filter(([, counts]) => counts.created > 0)
            .map(([entity, counts]) => `${entity.toLowerCase()}_created=${counts.created}`)
            .join(' '),
      );

      await recordAudit({
        actor: user,
        action: 'created',
        entity: 'CountrySyncRun',
        entityId: run.id,
        summary: `Synced ${source.name} → ${target.name}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.conflicts} conflicts`,
      });

      revalidatePath('/admin/settings/countries');
      revalidatePath('/admin/products');
      revalidatePath('/admin/pages');
      // Copied content gets its addresses through the same registry checks as
      // content made by hand: a copy never takes an address someone else holds.
      await syncContentRoutes({ all: true }, actorOf(user), 'created');
      return success(
        { ...result, runId: run.id },
        `${result.created} added, ${result.skipped} already here` +
          (result.deletedLocally > 0 ? `, ${result.deletedLocally} left removed` : '') +
          (result.conflicts > 0 ? `, ${result.conflicts} need a decision` : '') +
          '.',
      );
    } catch (error) {
      /*
       * The run is marked failed rather than left RUNNING, so a retry is not
       * blocked by the attempt that failed. Whatever was created before the
       * failure keeps its mapping, which is what makes the retry pick up where
       * this stopped instead of duplicating it.
       */
      await prisma.countrySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
        },
      });
      throw error;
    }
  } catch (error) {
    return toActionError(error);
  }
}

/** The last few runs into one market, for the admin panel. */
export async function recentSyncRuns(targetCountryId: string) {
  await authorize('settings.manage');
  return prisma.countrySyncRun.findMany({
    where: { targetCountryId },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      mode: true,
      status: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      conflictCount: true,
      failedCount: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      startedBy: { select: { name: true } },
    },
  });
}
