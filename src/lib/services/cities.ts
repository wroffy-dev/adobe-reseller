import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { countryPath } from '@/lib/country/routing';
import { getCountryById } from '@/lib/country/registry';
import { rebaseCitySlug } from '@/lib/cities/defaults';
import { applyPattern, effectivePattern, joinMarketPath } from '@/lib/urls/paths';

/**
 * Cities, read side.
 *
 * A city is a thin record over ordinary CMS pages, so most of what is shown
 * about it is read from those pages and from the URL registry: the public
 * address is the page's registered route, the status is the page's status.
 */

export type CityStatusFilter = 'active' | 'archived' | 'all';

export type CityListFilters = {
  countryIds: string[];
  countryId?: string | null;
  status?: CityStatusFilter;
  q?: string | null;
};

type Scores = { seo: number; aeo: number; geo: number; local: number | null; overall: number; analyzedAt: Date } | null;

export type CityRow = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  isActive: boolean;
  sortOrder: number;
  country: { id: string; name: string; code: string; slug: string };
  page: { id: string; title: string; status: string; path: string } | null;
  productPageCount: number;
  scores: Scores;
};

/**
 * Each page's public address: its registered route when it has one, otherwise
 * the address the page's slug gives it in its market. One query for all.
 */
export async function pagePublicPaths(
  pages: ReadonlyArray<{ id: string; slug: string; countryId: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pages.length === 0) return out;
  const routes = await prisma.urlRoute.findMany({
    where: { contentType: 'PAGE', contentId: { in: pages.map((p) => p.id) } },
    select: { contentId: true, countryId: true, path: true },
  });
  const byPage = new Map(routes.map((r) => [`${r.contentId}:${r.countryId}`, r.path]));
  for (const page of pages) {
    const registered = byPage.get(`${page.id}:${page.countryId}`);
    if (registered) {
      out.set(page.id, registered);
      continue;
    }
    const country = await getCountryById(page.countryId);
    out.set(page.id, country ? countryPath(country, page.slug) : `/${page.slug}`);
  }
  return out;
}

export async function listCities(filters: CityListFilters): Promise<CityRow[]> {
  const where: Prisma.CityWhereInput = {
    countryId: filters.countryId ? filters.countryId : { in: filters.countryIds },
    ...(filters.status === 'active' ? { isActive: true } : filters.status === 'archived' ? { isActive: false } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: 'insensitive' } },
            { slug: { contains: filters.q, mode: 'insensitive' } },
            { region: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (filters.countryId && !filters.countryIds.includes(filters.countryId)) return [];

  const cities = await prisma.city.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      country: { select: { id: true, name: true, code: true, slug: true } },
      page: { select: { id: true, title: true, status: true, slug: true, countryId: true, deletedAt: true } },
      _count: { select: { productPages: true } },
    },
  });

  const livePages = cities.flatMap((c) => (c.page && !c.page.deletedAt ? [c.page] : []));
  const [paths, analyses] = await Promise.all([
    pagePublicPaths(livePages),
    livePages.length
      ? prisma.seoAnalysis.findMany({
          where: { entityType: 'CITY_PAGE', entityId: { in: livePages.map((p) => p.id) } },
          select: {
            entityId: true,
            seoScore: true,
            aeoScore: true,
            geoScore: true,
            localScore: true,
            overallScore: true,
            analyzedAt: true,
          },
        })
      : [],
  ]);
  const scoreOf = new Map(analyses.map((a) => [a.entityId, a]));

  return cities.map((city) => {
    const page = city.page && !city.page.deletedAt ? city.page : null;
    const analysis = page ? scoreOf.get(page.id) : undefined;
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      region: city.region,
      isActive: city.isActive,
      sortOrder: city.sortOrder,
      country: city.country,
      page: page ? { id: page.id, title: page.title, status: page.status, path: paths.get(page.id) ?? '' } : null,
      productPageCount: city._count.productPages,
      scores: analysis
        ? {
            seo: analysis.seoScore,
            aeo: analysis.aeoScore,
            geo: analysis.geoScore,
            local: analysis.localScore,
            overall: analysis.overallScore,
            analyzedAt: analysis.analyzedAt,
          }
        : null,
    };
  });
}

export type CityProductPageRow = {
  id: string;
  product: { id: string; name: string; slug: string };
  page: { id: string; title: string; status: string; path: string; deleted: boolean };
  scores: Scores;
};

export async function getCityDetail(id: string) {
  const city = await prisma.city.findUnique({
    where: { id },
    include: {
      country: { select: { id: true, name: true, code: true, slug: true } },
      page: { select: { id: true, title: true, status: true, slug: true, countryId: true, deletedAt: true } },
      productPages: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: { select: { id: true, name: true, slug: true } },
          page: { select: { id: true, title: true, status: true, slug: true, countryId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!city) return null;

  const pages = [
    ...(city.page && !city.page.deletedAt ? [city.page] : []),
    ...city.productPages.map((m) => m.page).filter((p) => !p.deletedAt),
  ];
  const [paths, analyses, offered] = await Promise.all([
    pagePublicPaths(pages),
    pages.length
      ? prisma.seoAnalysis.findMany({
          where: { entityId: { in: pages.map((p) => p.id) }, entityType: { in: ['CITY_PAGE', 'CITY_PRODUCT_PAGE'] } },
        })
      : [],
    // Products this market sells — the only ones a city page may be made for.
    prisma.productCountry.findMany({
      where: { countryId: city.countryId, deletedAt: null, product: { deletedAt: null } },
      orderBy: [{ sortOrder: 'asc' }],
      select: { status: true, product: { select: { id: true, name: true, slug: true } } },
    }),
  ]);
  const scoreOf = new Map(analyses.map((a) => [a.entityId, a]));
  const scores = (pageId: string): Scores => {
    const a = scoreOf.get(pageId);
    return a
      ? { seo: a.seoScore, aeo: a.aeoScore, geo: a.geoScore, local: a.localScore, overall: a.overallScore, analyzedAt: a.analyzedAt }
      : null;
  };

  const page = city.page && !city.page.deletedAt ? city.page : null;
  return {
    id: city.id,
    name: city.name,
    slug: city.slug,
    region: city.region,
    isActive: city.isActive,
    sortOrder: city.sortOrder,
    country: city.country,
    page: page ? { id: page.id, title: page.title, status: page.status, slug: page.slug, path: paths.get(page.id) ?? '' } : null,
    pageScores: page ? scores(page.id) : null,
    productPages: city.productPages.map(
      (m): CityProductPageRow => ({
        id: m.id,
        product: m.product,
        page: {
          id: m.page.id,
          title: m.page.title,
          status: m.page.status,
          path: paths.get(m.page.id) ?? '',
          deleted: Boolean(m.page.deletedAt),
        },
        scores: m.page.deletedAt ? null : scores(m.page.id),
      }),
    ),
    availableProducts: offered.map((row) => ({ ...row.product, marketStatus: row.status })),
  };
}

export type CityDetail = NonNullable<Awaited<ReturnType<typeof getCityDetail>>>;

/**
 * The city a page belongs to, for breadcrumbs, schema and local SEO checks —
 * as its landing page, or as one of its product pages.
 */
export const cityOfPage = cache(async (pageId: string) => {
  const [asRoot, asProduct] = await Promise.all([
    prisma.city.findUnique({
      where: { pageId },
      select: { id: true, name: true, region: true, slug: true, isActive: true, countryId: true },
    }),
    prisma.cityProductPage.findUnique({
      where: { pageId },
      select: {
        product: { select: { id: true, name: true, slug: true } },
        city: {
          select: {
            id: true,
            name: true,
            region: true,
            slug: true,
            isActive: true,
            countryId: true,
            page: { select: { id: true, title: true, slug: true, status: true, deletedAt: true } },
          },
        },
      },
    }),
  ]);
  if (asRoot) return { kind: 'city' as const, city: asRoot, product: null, parent: null };
  if (asProduct) {
    const parent = asProduct.city.page && !asProduct.city.page.deletedAt ? asProduct.city.page : null;
    const { page: _page, ...city } = asProduct.city;
    return { kind: 'cityProduct' as const, city, product: asProduct.product, parent };
  }
  return null;
});

/**
 * The pages that move with a city: its landing page and every page nested
 * under its address in the same market ("delhi", "delhi/…").
 */
export async function pagesUnderCity(countryId: string, from: string, to: string) {
  const pages = await prisma.page.findMany({
    where: {
      countryId,
      deletedAt: null,
      OR: [{ slug: from }, { slug: { startsWith: `${from}/` } }],
    },
    select: { id: true, slug: true, title: true },
  });
  return pages.flatMap((page) => {
    const next = rebaseCitySlug(page.slug, from, to);
    return next === null ? [] : [{ ...page, newSlug: next }];
  });
}

/**
 * Keeps a city in step when its landing page is renamed in the page editor:
 * the city takes the new slug, and pages nested under the old address follow
 * it where the new address is free. Returns the pages that moved.
 */
export async function followCityPageRename(pageId: string, countryId: string, from: string, to: string): Promise<string[]> {
  const city = await prisma.city.findUnique({ where: { pageId }, select: { id: true } });
  if (!city || from === to || !to) return [];
  const children = (await pagesUnderCity(countryId, from, to)).filter((p) => p.id !== pageId);
  const moved: string[] = [];
  for (const child of children) {
    const clash = await prisma.page.findFirst({ where: { countryId, slug: child.newSlug }, select: { id: true } });
    if (clash) continue;
    await prisma.page.update({ where: { id: child.id }, data: { slug: child.newSlug } });
    moved.push(child.id);
  }
  const taken = await prisma.city.findFirst({ where: { countryId, slug: to, id: { not: city.id } }, select: { id: true } });
  if (!taken) await prisma.city.update({ where: { id: city.id }, data: { slug: to } });
  return moved;
}

export const SLUG_PLACEHOLDER = '__slug__';

/**
 * Where a page slug lands in each market, as a template: "/{slug}" for the
 * root market, "/ae/{slug}" for the UAE — honouring any page URL pattern set
 * in the Slug & URL Manager. Used for the live URL preview.
 */
export async function pagePathTemplates(countries: ReadonlyArray<{ id: string; slug: string }>): Promise<Record<string, string>> {
  const patterns = await prisma.urlPattern.findMany({ where: { contentType: 'PAGE' }, select: { contentType: true, countryId: true, pattern: true } });
  return Object.fromEntries(
    countries.map((country) => [
      country.id,
      joinMarketPath(country.slug, applyPattern(effectivePattern('PAGE', country.id, patterns).pattern, SLUG_PLACEHOLDER)),
    ]),
  );
}
