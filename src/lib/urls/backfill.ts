import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  applyPlan,
  invalidateLinkIndex,
  loadContext,
  planRoutes,
  withRegistryLock,
  type Actor,
} from './registry';
import { pathKey, URL_CONTENT_LABELS } from './paths';

/**
 * Registers every current URL, without changing any of them.
 *
 * Idempotent: running it again only registers what is new and brings the
 * rest in line, so it is safe to run after a restore, an import or a deploy.
 * Content keeps the address it has today — the built-in patterns reproduce
 * the pre-registry URLs exactly — and anything that cannot be registered is
 * reported, never overwritten:
 *
 *  - two pieces of content that today share one address (only one of them was
 *    actually reachable) — the one the site serves today is registered;
 *  - a redirect whose source is also a live page's address. It never fired,
 *    because the page answered first; it is kept, un-keyed, and listed so it
 *    can be reviewed rather than silently taking the page's address away;
 *  - legacy redirects whose sources normalise to the same address.
 */

export type Collision = {
  kind: 'content' | 'redirect-shadowed' | 'redirect-duplicate';
  path: string;
  label: string;
  reason: string;
};

export type BackfillReport = {
  registered: number;
  updated: number;
  unchanged: number;
  removed: number;
  collisions: Collision[];
};

export async function runBackfill(actor: Actor): Promise<BackfillReport> {
  const report = await withRegistryLock(async (tx) => {
    const ctx = await loadContext(tx);
    let plan = await planRoutes(tx, ctx, { all: true });
    const collisions: Collision[] = [];

    // A redirect shadowed by live content never fired: the content wins.
    const shadowed = plan.items.filter(
      (item) => item.status === 'conflict' && item.reason?.startsWith('Already used by a redirect'),
    );
    if (shadowed.length) {
      const keys = shadowed.map((item) => pathKey(item.newPath!));
      const redirects = await tx.redirect.findMany({
        where: { sourceKey: { in: keys }, targetRouteId: null },
        select: { id: true, source: true, destination: true },
      });
      for (const redirect of redirects) {
        await tx.redirect.update({
          where: { id: redirect.id },
          data: {
            sourceKey: null,
            note: `Shadowed by live content at registration: ${redirect.source} is a page's own address, so this rule never applied.`,
          },
        });
        collisions.push({
          kind: 'redirect-shadowed',
          path: redirect.source,
          label: `Redirect → ${redirect.destination}`,
          reason: 'Its source is also the address of live content, which is what visitors have been getting. Kept for review; it does not apply.',
        });
      }
      plan = await planRoutes(tx, ctx, { all: true });
    }

    for (const item of plan.items.filter((i) => i.status === 'conflict')) {
      collisions.push({
        kind: 'content',
        path: item.newPath ?? '',
        label: `${URL_CONTENT_LABELS[item.type]} “${item.label}”`,
        reason: item.reason ?? 'Address unavailable.',
      });
    }

    const duplicates = await tx.redirect.findMany({
      where: { sourceKey: null, note: { not: { startsWith: 'Shadowed by live content' } } },
      select: { source: true, destination: true },
      take: 200,
    });
    for (const row of duplicates) {
      collisions.push({
        kind: 'redirect-duplicate',
        path: row.source,
        label: `Redirect → ${row.destination}`,
        reason: 'Another redirect already uses the same address once normalised (case, slashes). Only the oldest applies.',
      });
    }

    const applied = await applyPlan(tx, ctx, plan, { actor, action: 'registered', recordCreates: false });

    await tx.urlSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        backfilledAt: new Date(),
        lastCollisions: collisions as unknown as Prisma.InputJsonValue,
      },
      update: {
        backfilledAt: new Date(),
        lastCollisions: collisions as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      registered: applied.created,
      updated: applied.moved,
      unchanged: applied.unchanged,
      removed: applied.removed,
      collisions,
    };
  });
  invalidateLinkIndex();
  return report;
}

/** Switches the registry resolver on or off. Off restores pre-registry routing. */
export async function setResolverEnabled(enabled: boolean): Promise<void> {
  await prisma.urlSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', resolverEnabled: enabled, activatedAt: enabled ? new Date() : null },
    update: { resolverEnabled: enabled, ...(enabled ? { activatedAt: new Date() } : {}) },
  });
  invalidateLinkIndex();
}
