import 'server-only';
import type { UrlContentType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { countryPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import { applyPattern, DEFAULT_PATTERNS, joinMarketPath } from './paths';
import { onRoutesChanged } from './registry';

/**
 * Where content links to — the one helper every card, menu, breadcrumb,
 * canonical, sitemap entry and hreflang annotation asks.
 *
 * The registry's routes are loaded in a single query and held for a few
 * seconds per process, so a listing of fifty products makes one query, not
 * fifty. A write in this process drops the cache at once; other processes
 * pick the change up within the TTL, and in the meantime an old link still
 * lands through its redirect.
 *
 * With the registry resolver switched off, every answer is the built-in
 * address — exactly what the site served before.
 */

const TTL_MS = 10_000;

type Row = { contentType: UrlContentType; contentId: string; countryId: string; contentSlug: string; path: string };

type Snapshot = {
  enabled: boolean;
  byIdentity: Map<string, string>;
  bySlug: Map<string, string>;
  /** "type|slug" → path, first market wins — for the root-only blog. */
  anyBySlug: Map<string, string>;
  byContent: Map<string, Array<{ countryId: string; path: string }>>;
  loadedAt: number;
};

let snapshot: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;

onRoutesChanged(() => {
  snapshot = null;
});

async function load(): Promise<Snapshot> {
  try {
    const settings = await prisma.urlSettings.findUnique({
      where: { id: 'singleton' },
      select: { resolverEnabled: true },
    });
    const enabled = Boolean(settings?.resolverEnabled);
    const rows: Row[] = enabled
      ? await prisma.urlRoute.findMany({
          select: { contentType: true, contentId: true, countryId: true, contentSlug: true, path: true },
        })
      : [];
    const byIdentity = new Map<string, string>();
    const bySlug = new Map<string, string>();
    const anyBySlug = new Map<string, string>();
    const byContent = new Map<string, Array<{ countryId: string; path: string }>>();
    for (const row of rows) {
      byIdentity.set(`${row.contentType}|${row.contentId}|${row.countryId}`, row.path);
      bySlug.set(`${row.contentType}|${row.countryId}|${row.contentSlug}`, row.path);
      if (!anyBySlug.has(`${row.contentType}|${row.contentSlug}`)) {
        anyBySlug.set(`${row.contentType}|${row.contentSlug}`, row.path);
      }
      const list = byContent.get(`${row.contentType}|${row.contentId}`) ?? [];
      list.push({ countryId: row.countryId, path: row.path });
      byContent.set(`${row.contentType}|${row.contentId}`, list);
    }
    return { enabled, byIdentity, bySlug, anyBySlug, byContent, loadedAt: Date.now() };
  } catch (error) {
    // The registry tables may not exist yet on a database that has not run the
    // migration. Links fall back to the built-in addresses.
    console.error('[urls] link index unavailable', error);
    return { enabled: false, byIdentity: new Map(), bySlug: new Map(), anyBySlug: new Map(), byContent: new Map(), loadedAt: Date.now() };
  }
}

/** Refreshes the snapshot when it is older than the TTL. Call once per request. */
export async function loadLinks(): Promise<Links> {
  if (!snapshot || Date.now() - snapshot.loadedAt > TTL_MS) {
    loading ??= load().finally(() => {
      loading = null;
    });
    snapshot = await loading;
  }
  return linksFrom(snapshot);
}

/**
 * The most recent snapshot, synchronously — for the pure helpers that build
 * links deep inside render code. The public layout loads it at the start of
 * every request, so it is never older than the TTL there.
 */
export function links(): Links {
  return linksFrom(snapshot);
}

export type MarketRef = Pick<CountryContext, 'id' | 'slug'>;

export type Links = ReturnType<typeof linksFrom>;

function legacy(type: UrlContentType, market: MarketRef | null, slug: string): string {
  const relative = applyPattern(DEFAULT_PATTERNS[type], slug);
  if (!market) return relative;
  return countryPath(market, relative);
}

function linksFrom(state: Snapshot | null) {
  const on = Boolean(state?.enabled);

  const bySlug = (type: UrlContentType, market: MarketRef, slug: string) =>
    on ? state!.bySlug.get(`${type}|${market.id}|${slug}`) : undefined;

  return {
    enabled: on,

    /** A product in one market. */
    product(market: MarketRef, slug: string): string {
      return bySlug('PRODUCT', market, slug) ?? legacy('PRODUCT', market, slug);
    },

    /** A CMS page in one market, by its slug. */
    page(market: MarketRef, slug: string): string {
      return bySlug('PAGE', market, slug) ?? countryPath(market, slug);
    },

    /** Any route by content identity, or null when it has none there. */
    byId(type: UrlContentType, contentId: string, countryId: string): string | null {
      return on ? (state!.byIdentity.get(`${type}|${contentId}|${countryId}`) ?? null) : null;
    },

    /** Every market's address for one piece of content — hreflang, switching. */
    everywhere(type: UrlContentType, contentId: string): Array<{ countryId: string; path: string }> {
      return on ? (state!.byContent.get(`${type}|${contentId}`) ?? []) : [];
    },

    /** Root-only blog addresses. */
    post(slug: string): string {
      return firstBySlug(state, on, 'BLOG_POST', slug) ?? legacy('BLOG_POST', null, slug);
    },
    blogCategory(slug: string): string {
      return firstBySlug(state, on, 'BLOG_CATEGORY', slug) ?? legacy('BLOG_CATEGORY', null, slug);
    },
    blogTag(slug: string): string {
      return firstBySlug(state, on, 'BLOG_TAG', slug) ?? legacy('BLOG_TAG', null, slug);
    },

    /** A taxonomy landing page, by the page's id. */
    pageById(pageId: string, countryId: string): string | null {
      if (!on) return null;
      return (
        state!.byIdentity.get(`PAGE|${pageId}|${countryId}`) ??
        state!.byIdentity.get(`CATEGORY_PAGE|${pageId}|${countryId}`) ??
        state!.byIdentity.get(`BRAND_PAGE|${pageId}|${countryId}`) ??
        null
      );
    },
  };
}

/** The blog is root-only, so any market's row answers — there is one. */
function firstBySlug(state: Snapshot | null, on: boolean, type: UrlContentType, slug: string): string | undefined {
  if (!on || !state) return undefined;
  return state.anyBySlug.get(`${type}|${slug}`);
}

/** The market-relative form of a full path in `market`, for legacy callers. */
export function marketRelative(market: Pick<CountryContext, 'slug'>, fullPath: string): string {
  const prefix = market.slug ? `/${market.slug}` : '';
  if (prefix && (fullPath === prefix || fullPath.startsWith(`${prefix}/`))) {
    return fullPath.slice(prefix.length) || '/';
  }
  return fullPath;
}

export { joinMarketPath };
