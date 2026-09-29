import 'server-only';
import { cache } from 'react';
import type { UrlContentType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveCountryPath } from '@/lib/country/registry';
import { contentSlug } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import { pathKey } from './paths';
import { publishedPageWhere } from '@/lib/services/pages';
import { publishedPostWhere } from '@/lib/services/blog';
import { loadLinks } from './links';

/**
 * Public URL resolution — one answer for every public route.
 *
 * The catch-all and the concrete `/products/*` and `/blog/*` routes all ask
 * here, so a moved product's old `/products/x` is redirected by the very route
 * that used to render it, before anything streams, rather than only after a
 * 404. Admin, API, auth and asset requests never reach this code, so they pay
 * no lookup.
 *
 * Order, with the registry on:
 *
 *   1. the registry        a live route owns the address (by normalised key)
 *   2. redirects           a rule for this exact address, then the market-
 *                          relative form for rules written for every market
 *   3. legacy addresses    content still reachable at its pre-registry URL
 *                          is sent to its registered one; unregistered
 *                          content (an unresolved collision) renders as before
 *   4. 404
 *
 * With the registry off, only 2–4 apply and the site behaves exactly as it
 * did before the registry existed.
 */

export type LegacySurface =
  | { kind: 'page'; slug: string }
  | { kind: 'blog' }
  | { kind: 'post'; slug: string }
  | { kind: 'category'; slug: string }
  | { kind: 'tag'; slug: string }
  | { kind: 'product'; slug: string }
  | { kind: 'missing' };

export type RegisteredRoute = {
  id: string;
  contentType: UrlContentType;
  contentId: string;
  countryId: string;
  path: string;
};

export type Resolution =
  | { kind: 'route'; country: CountryContext; route: RegisteredRoute; requested: string }
  | { kind: 'redirect'; destination: string; permanent: boolean; requested: string }
  | { kind: 'legacy'; country: CountryContext; surface: LegacySurface; requested: string }
  | { kind: 'missing'; country: CountryContext; requested: string };

/** The pre-registry classification of a market-relative path. */
export function classifyLegacy(segments: string[]): LegacySurface {
  if (segments[0] === 'blog') {
    const [, second, third] = segments;
    if (segments.length === 1) return { kind: 'blog' };
    if (second === 'category') {
      return third && segments.length === 3 ? { kind: 'category', slug: third } : { kind: 'missing' };
    }
    if (second === 'tag') {
      return third && segments.length === 3 ? { kind: 'tag', slug: third } : { kind: 'missing' };
    }
    return second && segments.length === 2 ? { kind: 'post', slug: second } : { kind: 'missing' };
  }
  if (segments[0] === 'products') {
    const [, second] = segments;
    return second && segments.length === 2 ? { kind: 'product', slug: second } : { kind: 'missing' };
  }
  return { kind: 'page', slug: segments.join('/') };
}

const BLOG_SURFACES = new Set(['blog', 'post', 'category', 'tag']);

export const isRegistryEnabled = cache(async (): Promise<boolean> => {
  try {
    const row = await prisma.urlSettings.findUnique({
      where: { id: 'singleton' },
      select: { resolverEnabled: true },
    });
    return Boolean(row?.resolverEnabled);
  } catch {
    return false;
  }
});

/**
 * An active redirect for this address: the exact full address first, then the
 * market-relative one, so a rule written once for `/old-plan` still applies in
 * every market while `/ae/old-plan` stays UAE-only.
 */
export async function findRedirectRule(
  fullPath: string,
  relativePath: string,
): Promise<{ id: string; destination: string; permanent: boolean } | null> {
  const keys = Array.from(new Set([pathKey(fullPath), pathKey(relativePath)]));
  const rows = await prisma.redirect.findMany({
    where: {
      isActive: true,
      OR: [
        { sourceKey: { in: keys } },
        // Legacy rows the migration could not key keep matching on the raw
        // source, spelled either way.
        {
          sourceKey: null,
          source: { in: keys.flatMap((k) => [k, k.replace(/^\//, '')]) },
        },
      ],
    },
    select: { id: true, sourceKey: true, source: true, destination: true, type: true },
  });
  if (rows.length === 0) return null;
  const exact = rows.find((r) => (r.sourceKey ?? pathKey(r.source)) === keys[0]) ?? rows[0]!;
  if (pathKey(exact.destination) === pathKey(exact.sourceKey ?? exact.source)) return null;

  // Best effort; never delays the redirect.
  prisma.redirect
    .update({ where: { id: exact.id }, data: { hitCount: { increment: 1 }, lastHitAt: new Date() } })
    .catch(() => undefined);

  return { id: exact.id, destination: exact.destination, permanent: exact.type === 'PERMANENT' };
}

/** Resolves a public request path. Cached per request, so metadata and page share it. */
export const resolvePublicRequest = cache(async (segmentsKey: string): Promise<Resolution> => {
  const segments = segmentsKey ? segmentsKey.split('/') : [];
  // Warm the link snapshot for everything this request renders.
  await loadLinks();
  const requested = `/${segments.join('/')}`.replace(/\/+$/, '') || '/';
  const { country, path } = await resolveCountryPath(requested);
  const relative = contentSlug(path);
  const legacy = classifyLegacy(relative ? relative.split('/') : []);
  const enabled = await isRegistryEnabled();

  if (enabled) {
    const route = await prisma.urlRoute.findUnique({
      where: { pathKey: pathKey(requested) },
      select: { id: true, contentType: true, contentId: true, countryId: true, path: true },
    });
    // A route in a market that is switched off (its prefix no longer
    // resolves to it) is not served — nothing in an inactive market is public.
    if (route && route.countryId === country.id) {
      // "/Dropbox" and "/dropbox/" are the same address; the canonical
      // spelling is the only one served.
      if (route.path !== requested) {
        return { kind: 'redirect', destination: route.path, permanent: true, requested };
      }
      return { kind: 'route', country, route, requested };
    }
  }

  const rule = await findRedirectRule(requested, path);
  if (rule) return { kind: 'redirect', destination: rule.destination, permanent: rule.permanent, requested };

  /*
   * The blog lives at the root. A market-prefixed blog address redirects to
   * the root's equivalent, and only when that exists.
   */
  if (!country.isDefault && BLOG_SURFACES.has(legacy.kind)) {
    const target = await rootBlogEquivalent(legacy, enabled);
    return target
      ? { kind: 'redirect', destination: target, permanent: true, requested }
      : { kind: 'missing', country, requested };
  }

  if (!enabled) return { kind: 'legacy', country, surface: legacy, requested };

  // Registry on: a pre-registry address of registered content moves to its
  // current address; content that never got a route renders as it used to.
  const moved = await legacyDestination(country, legacy);
  if (moved === 'unregistered') return { kind: 'legacy', country, surface: legacy, requested };
  if (moved) return { kind: 'redirect', destination: moved, permanent: true, requested };
  if (legacy.kind === 'blog') return { kind: 'legacy', country, surface: legacy, requested };
  return { kind: 'missing', country, requested };
});

async function rootBlogEquivalent(surface: LegacySurface, enabled: boolean): Promise<string | null> {
  if (surface.kind === 'blog') return '/blog';
  if (surface.kind !== 'post' && surface.kind !== 'category' && surface.kind !== 'tag') return null;
  const type: UrlContentType =
    surface.kind === 'post' ? 'BLOG_POST' : surface.kind === 'category' ? 'BLOG_CATEGORY' : 'BLOG_TAG';
  if (enabled) {
    const route = await prisma.urlRoute.findFirst({
      where: { contentType: type, contentSlug: surface.slug },
      select: { path: true },
    });
    if (route) return route.path;
  }
  const exists =
    surface.kind === 'post'
      ? await prisma.blogPost.findFirst({ where: { slug: surface.slug, deletedAt: null }, select: { id: true } })
      : surface.kind === 'category'
        ? await prisma.blogCategory.findFirst({ where: { slug: surface.slug }, select: { id: true } })
        : await prisma.blogTag.findFirst({ where: { slug: surface.slug }, select: { id: true } });
  if (!exists) return null;
  return surface.kind === 'post'
    ? `/blog/${surface.slug}`
    : `/blog/${surface.kind}/${surface.slug}`;
}

/**
 * Where published content found at its pre-registry address lives now.
 *
 * Returns the registered path, `'unregistered'` when the content exists but
 * has no route (it collided at backfill and is served as before), or null.
 * Only published content is considered, so a draft is never exposed here.
 */
async function legacyDestination(
  country: CountryContext,
  surface: LegacySurface,
): Promise<string | 'unregistered' | null> {
  let type: UrlContentType | null = null;
  let contentId: string | null = null;

  switch (surface.kind) {
    case 'product': {
      const row = await prisma.productCountry.findFirst({
        where: {
          countryId: country.id,
          deletedAt: null,
          status: 'PUBLISHED',
          OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
          product: { deletedAt: null, slug: surface.slug },
        },
        select: { productId: true },
      });
      type = 'PRODUCT';
      contentId = row?.productId ?? null;
      break;
    }
    case 'page': {
      const row = await prisma.page.findFirst({
        where: { ...publishedPageWhere(), countryId: country.id, slug: surface.slug },
        select: { id: true },
      });
      contentId = row?.id ?? null;
      if (contentId) {
        const route = await prisma.urlRoute.findFirst({
          where: { contentId, countryId: country.id, contentType: { in: ['PAGE', 'CATEGORY_PAGE', 'BRAND_PAGE'] } },
          select: { path: true },
        });
        return route ? route.path : 'unregistered';
      }
      return null;
    }
    case 'post': {
      const row = await prisma.blogPost.findFirst({
        where: { ...publishedPostWhere(country.id), slug: surface.slug },
        select: { id: true },
      });
      type = 'BLOG_POST';
      contentId = row?.id ?? null;
      break;
    }
    case 'category': {
      const row = await prisma.blogCategory.findFirst({ where: { slug: surface.slug }, select: { id: true } });
      type = 'BLOG_CATEGORY';
      contentId = row?.id ?? null;
      break;
    }
    case 'tag': {
      const row = await prisma.blogTag.findFirst({ where: { slug: surface.slug }, select: { id: true } });
      type = 'BLOG_TAG';
      contentId = row?.id ?? null;
      break;
    }
    default:
      return null;
  }

  if (!type || !contentId) return null;
  const route = await prisma.urlRoute.findUnique({
    where: { contentType_contentId_countryId: { contentType: type, contentId, countryId: country.id } },
    select: { path: true },
  });
  return route ? route.path : 'unregistered';
}

// ---------------------------------------------------------------------------
// 404 recording for URL Health
// ---------------------------------------------------------------------------

const MAX_LOGGED_PATHS = 5_000;
const MAX_PATH_LENGTH = 300;

/**
 * Records a public 404: the normalised path only — never the query string,
 * which can carry emails or tokens — and the referring host, not the full
 * referrer. Bounded: once the log holds MAX_LOGGED_PATHS addresses, only
 * addresses already in it are counted.
 */
export async function recordNotFound(path: string, referrer: string | null): Promise<void> {
  try {
    const key = pathKey(path).slice(0, MAX_PATH_LENGTH);
    if (/\.[a-z0-9]{2,5}$/i.test(key)) return; // missing files are not pages
    let referrerHost: string | null = null;
    if (referrer) {
      try {
        referrerHost = new URL(referrer).host.slice(0, 120);
      } catch {
        referrerHost = null;
      }
    }
    const existing = await prisma.notFoundLog.findUnique({ where: { pathKey: key }, select: { id: true } });
    if (existing) {
      await prisma.notFoundLog.update({
        where: { id: existing.id },
        data: { hits: { increment: 1 }, lastSeenAt: new Date(), referrerHost: referrerHost ?? undefined },
      });
      return;
    }
    const count = await prisma.notFoundLog.count();
    if (count >= MAX_LOGGED_PATHS) return;
    await prisma.notFoundLog.create({ data: { pathKey: key, path: key, referrerHost } });
  } catch {
    // Diagnostics never break a response.
  }
}
