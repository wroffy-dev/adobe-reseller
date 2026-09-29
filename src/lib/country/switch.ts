import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { publishedPageWhere } from '@/lib/services/pages';
import { publishedPostWhere } from '@/lib/services/blog';
import { listActiveCountries } from './registry';
import { countryPath, contentSlug } from './routing';
import type { CountryContext } from './types';
import { loadLinks } from '@/lib/urls/links';
import { pathKey } from '@/lib/urls/paths';

/**
 * Where the market switcher should send a visitor.
 *
 * The rule is "the same thing, in the other market, when it exists there".
 * Every target is resolved on the server against real, published content, so
 * the switcher can only ever produce a URL that resolves — and when it cannot,
 * it falls back to that market's home page rather than to a 404 or to a
 * redirect that could bounce back.
 *
 * Nothing about this is automatic: geolocation never moves a visitor between
 * markets. Switching is something a person does deliberately.
 */

export type MarketOption = {
  code: string;
  name: string;
  slug: string;
  locale: string;
  href: string;
  isCurrent: boolean;
  /** False when the visitor will land on the market's home instead of here. */
  isEquivalent: boolean;
};

/** The public surface a path points at, as far as switching is concerned. */
type Surface =
  | { kind: 'home' }
  | { kind: 'page'; slug: string }
  | { kind: 'post'; slug: string }
  | { kind: 'shared'; path: string };

function classify(path: string): Surface {
  const slug = contentSlug(path);
  if (!slug) return { kind: 'home' };
  const segments = slug.split('/');

  if (segments[0] === 'blog') {
    // The archive and the (globally shared) category and tag archives exist in
    // every market, so they map across directly.
    if (segments.length === 1) return { kind: 'shared', path: slug };
    if (segments[1] === 'category' || segments[1] === 'tag') return { kind: 'shared', path: slug };
    return { kind: 'post', slug: segments[1] ?? '' };
  }

  if (segments[0] === 'products' && segments[1]) {
    // A product page exists in a market only when that market sells it, which
    // is exactly the ProductCountry check below.
    return { kind: 'page', slug };
  }

  return { kind: 'page', slug };
}

/**
 * Markets where the current content also exists and is published.
 *
 * One query per content kind, not one per market, so adding markets does not
 * add queries.
 */
async function countriesWithEquivalent(surface: Surface): Promise<Set<string>> {
  if (surface.kind === 'home' || surface.kind === 'shared') return new Set();

  if (surface.kind === 'post') {
    const rows = await prisma.blogPost.findMany({
      where: { ...publishedPostWhere(), slug: surface.slug },
      select: { countryId: true },
    });
    return new Set(rows.map((row) => row.countryId));
  }

  const productSlug = surface.slug.startsWith('products/')
    ? surface.slug.slice('products/'.length)
    : null;

  if (productSlug) {
    const rows = await prisma.productCountry.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
        product: { deletedAt: null, slug: productSlug },
      },
      select: { countryId: true },
    });
    return new Set(rows.map((row) => row.countryId));
  }

  const rows = await prisma.page.findMany({
    where: { ...publishedPageWhere(), slug: surface.slug },
    select: { countryId: true },
  });
  return new Set(rows.map((row) => row.countryId));
}

/**
 * Markets whose own home page is published.
 *
 * Every fallback the switcher offers is a market's root, so a market without a
 * published home page has no reachable fallback — offering it would send the
 * visitor to a 404. That is not hypothetical: a market created ahead of its
 * content is active and empty, which is exactly the state a new market starts
 * in. One query, not one per market.
 */
async function countriesWithHome(): Promise<Set<string>> {
  const rows = await prisma.page.findMany({
    where: { ...publishedPageWhere(), isHomepage: true },
    select: { countryId: true },
  });
  return new Set(rows.map((row) => row.countryId));
}

/**
 * The same content in every market, by identity, from the URL registry.
 *
 * Returns market id → that market's own address for it, or null when the
 * registry is off or the current address is not a registered route (the
 * classic slug-based matching below then applies). A product pairs with the
 * same product; a page with the page of the same slug; the root-only blog
 * with itself.
 */
async function registryEquivalents(current: CountryContext, path: string): Promise<Map<string, string> | null> {
  const links = await loadLinks();
  if (!links.enabled) return null;
  const route = await prisma.urlRoute.findUnique({
    where: { pathKey: pathKey(countryPath(current, path)) },
    select: { contentType: true, contentId: true, countryId: true, path: true },
  });
  if (!route || route.countryId !== current.id) return null;

  const out = new Map<string, string>();
  if (route.contentType === 'PRODUCT') {
    const live = await prisma.productCountry.findMany({
      where: {
        productId: route.contentId,
        deletedAt: null,
        status: 'PUBLISHED',
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
        product: { deletedAt: null },
      },
      select: { countryId: true },
    });
    const liveIds = new Set(live.map((row) => row.countryId));
    for (const entry of links.everywhere('PRODUCT', route.contentId)) {
      if (liveIds.has(entry.countryId)) out.set(entry.countryId, entry.path);
    }
    return out;
  }

  if (route.contentType === 'BLOG_POST' || route.contentType === 'BLOG_CATEGORY' || route.contentType === 'BLOG_TAG') {
    // Root-only: the same address serves every market.
    const markets = await listActiveCountries();
    for (const market of markets) out.set(market.id, route.path);
    return out;
  }

  // Pages: the page with the same slug in each market, at its own address.
  const page = await prisma.page.findUnique({ where: { id: route.contentId }, select: { slug: true } });
  if (!page) return out;
  const twins = await prisma.page.findMany({
    where: { ...publishedPageWhere(), slug: page.slug },
    select: { id: true, countryId: true },
  });
  for (const twin of twins) {
    const own = links.pageById(twin.id, twin.countryId);
    if (own) out.set(twin.countryId, own);
  }
  return out;
}

export const resolveMarketOptions = cache(
  async (current: CountryContext, path: string): Promise<MarketOption[]> => {
    const [countries, surface] = await Promise.all([
      listActiveCountries(),
      Promise.resolve(classify(path)),
    ]);

    if (countries.length < 2) return [];
    const [registry, withHome] = await Promise.all([
      registryEquivalents(current, path),
      countriesWithHome(),
    ]);
    const equivalents = registry ? new Set(registry.keys()) : await countriesWithEquivalent(surface);

    /*
     * A market is offered only when the visitor has somewhere to land: this
     * content in that market, or that market's home page. The market being
     * viewed always stays, so the switcher can show what is current.
     */
    const reachable = countries.filter(
      (country) =>
        country.id === current.id || withHome.has(country.id) || equivalents.has(country.id),
    );

    // One option is the market already being viewed; that is not a switcher.
    if (reachable.length < 2) return [];

    return reachable.map((country) => {
      const isCurrent = country.id === current.id;

      let href = countryPath(country);
      let isEquivalent = false;

      if (surface.kind === 'home') {
        isEquivalent = true;
      } else if (registry) {
        const own = registry.get(country.id);
        if (own) {
          href = own;
          isEquivalent = true;
        }
      } else if (surface.kind === 'shared') {
        href = countryPath(country, surface.path);
        isEquivalent = true;
      } else if (isCurrent || equivalents.has(country.id)) {
        href = countryPath(country, surface.kind === 'post' ? `blog/${surface.slug}` : surface.slug);
        isEquivalent = true;
      }

      return {
        code: country.code,
        name: country.name,
        slug: country.slug,
        locale: country.locale,
        href,
        isCurrent,
        isEquivalent,
      };
    });
  },
);
