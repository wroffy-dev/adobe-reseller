import 'server-only';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import {
  redirectCandidates,
  redirectLookupPaths,
  isSelfRedirect,
} from '@/lib/seo/redirect-paths';
import type { CountryContext } from '@/lib/country/types';
import { recordNotFound } from '@/lib/urls/resolver';
import { headers } from 'next/headers';

/**
 * Redirects, for every address the site serves.
 *
 * A rule written in the redirect manager has to apply wherever the old URL was
 * — a renamed product, a retired article, a category that moved — not only to
 * the pages the CMS happens to own. Every surface that can 404 asks the same
 * question here, so there is one answer rather than one per route.
 */

/**
 * Resolves an active redirect for a path that produced nothing.
 *
 * The full request path is tried first, so a market can redirect
 * `/ae/old-plan` independently, and the market-relative path second, so a
 * redirect defined once still applies inside whichever market asked for it.
 * Loop protection: a redirect whose destination equals its own source is
 * ignored.
 */
export async function findRedirect(
  path: string,
  fallbackPath?: string,
): Promise<{ destination: string; permanent: boolean } | null> {
  const rule = await prisma.redirect.findFirst({
    where: { isActive: true, source: { in: redirectCandidates(path, fallbackPath) } },
  });
  if (!rule) return null;

  if (isSelfRedirect(rule.source, rule.destination)) return null;

  // Best-effort hit counter; never block the redirect on it.
  prisma.redirect
    .update({ where: { id: rule.id }, data: { hitCount: { increment: 1 } } })
    .catch(() => undefined);

  return { destination: rule.destination, permanent: rule.type === 'PERMANENT' };
}

/**
 * What a surface does when it has nothing to show: follow a redirect if one
 * was written for this address, and 404 otherwise.
 *
 * `path` is the market-relative address — `products/dropbox-standard`,
 * `blog/some-article`, or the page slug — and the market's own prefix is added
 * here, so one rule can be written for every market or for one of them.
 *
 * Never returns: it either redirects or raises the not-found response.
 */
export async function redirectOrNotFound(
  country: Pick<CountryContext, 'slug'>,
  path: string,
): Promise<never> {
  const { full, relative } = redirectLookupPaths(country, path);
  const target = await findRedirect(full, relative);

  if (target) {
    if (target.permanent) permanentRedirect(target.destination);
    redirect(target.destination);
  }
  // A miss is recorded for URL Health: the path only, never the query.
  let referrer: string | null = null;
  try {
    referrer = (await headers()).get('referer');
  } catch {
    referrer = null;
  }
  await recordNotFound(full, referrer);
  return notFound();
}
