import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { listCountries } from '@/lib/country/registry';
import { countryPath } from '@/lib/country/routing';
import { getCountrySettings } from '@/lib/country/settings';
import type { CountryContext, CountrySettingsView } from '@/lib/country/types';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { compileRobots, type CountryRobots } from '@/lib/seo/robots';
import { countryUrls } from '@/lib/seo/sitemap';
import { siteUrl } from '@/lib/env';
import { analyze, combine, countFindings, RULES_VERSION } from './analyzer';
import { extractSections, withProductRecord } from './content-extractor';
import { findDuplicates, type Comparable } from './duplicates';
import { scoreOf } from './finding';
import { robotsDisallows } from './robots-check';
import { siteFindings } from './site-score';
import { hashKey, minhashSignature, normalise } from './text';
import type { AnalysisInput, EntityType, Finding } from './types';

/**
 * Loads content in batches, turns it into analyser input, and stores the
 * results in `SeoAnalysis`.
 *
 * Everything a rule needs from outside the page — the market's settings, the
 * sitemap the site serves, robots.txt, the URL registry, the catalogue — is
 * read once per run, never once per page. The sitemap and robots checks call
 * the same functions that build /sitemap.xml and /robots.txt, so a page is
 * "in the sitemap" exactly when the served sitemap lists it.
 */

export type Target = { kind: 'page' | 'product' | 'post'; id: string };

const BATCH = 200;

type Global = {
  origin: string;
  siteName: string;
  siteOgImage: boolean;
  noIndexSite: boolean;
  sitemapEnabled: boolean;
  verification: boolean;
  robotsBody: string;
  robotsErrors: string[];
  robotsWarnings: string[];
  excluded: Set<string>;
};

type CatalogueProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  isFeatured: boolean;
  featuredOrder: number;
  sortOrder: number;
  live: boolean;
};

type Market = {
  country: CountryContext;
  local: CountrySettingsView;
  sitemapLocs: Set<string>;
  catalogue: CatalogueProduct[];
  cityNames: string[];
};

type Prepared = {
  entityType: EntityType;
  entityId: string;
  countryId: string;
  cityId: string | null;
  input: Omit<AnalysisInput, 'duplicates'>;
  signature: number[];
  titleKey: string | null;
  descriptionKey: string | null;
  h1Key: string | null;
};

// ---------------------------------------------------------------------------
// Context, loaded once per run
// ---------------------------------------------------------------------------

async function loadGlobal(countries: CountryContext[]): Promise<Global> {
  const [seo, site, settings] = await Promise.all([
    getSeoSettings(),
    getWebsiteSettings(),
    prisma.countrySettings.findMany({
      select: { countryId: true, robotsDisallow: true, robotsAllow: true, noIndexCountry: true, excludeFromSitemap: true },
    }),
  ]);
  const byCountry = new Map(settings.map((row) => [row.countryId, row]));
  const rows: CountryRobots[] = countries.map((country) => {
    const row = byCountry.get(country.id);
    return {
      slug: country.slug,
      name: country.name,
      isActive: country.isActive,
      isPublished: country.isPublished,
      disallow: row?.robotsDisallow ?? null,
      allow: row?.robotsAllow ?? null,
      noIndexCountry: row?.noIndexCountry ?? false,
      excludeFromSitemap: row?.excludeFromSitemap ?? false,
    };
  });
  const origin = siteUrl().replace(/\/$/, '');
  const robots = compileRobots({
    baseUrl: origin,
    noIndexSite: seo.noIndexSite,
    sitemapEnabled: seo.sitemapEnabled !== false,
    extra: seo.robotsTxtExtra ?? null,
    countries: rows,
  });
  return {
    origin,
    siteName: site.siteName,
    siteOgImage: Boolean(site.ogImageUrl),
    noIndexSite: seo.noIndexSite,
    sitemapEnabled: seo.sitemapEnabled !== false,
    verification: Boolean(seo.googleSiteVerification || seo.bingSiteVerification),
    robotsBody: robots.body,
    robotsErrors: robots.warnings.filter((w) => w.level === 'error').map((w) => w.message),
    robotsWarnings: robots.warnings.filter((w) => w.level === 'warning').map((w) => w.message),
    excluded: new Set(settings.filter((s) => s.excludeFromSitemap).map((s) => s.countryId)),
  };
}

async function loadMarket(country: CountryContext, global: Global): Promise<Market> {
  const now = new Date();
  const [local, urls, offers, cities] = await Promise.all([
    getCountrySettings(country),
    // The served sitemap lists a market only when it is active, published,
    // not excluded, and the sitemap is on — the same gates as sitemapChildren.
    global.sitemapEnabled && country.isActive && country.isPublished && !global.excluded.has(country.id)
      ? countryUrls(country)
      : Promise.resolve([]),
    prisma.productCountry.findMany({
      where: { countryId: country.id, deletedAt: null, product: { deletedAt: null } },
      select: {
        status: true,
        publishedAt: true,
        isFeatured: true,
        featuredOrder: true,
        sortOrder: true,
        product: { select: { id: true, name: true, categoryId: true } },
      },
    }),
    prisma.city.findMany({ where: { countryId: country.id }, select: { name: true } }),
  ]);
  return {
    country,
    local,
    sitemapLocs: new Set(urls.map((u) => u.loc.replace(/\/$/, ''))),
    catalogue: offers.map((o) => ({
      id: o.product.id,
      name: o.product.name,
      categoryId: o.product.categoryId,
      isFeatured: o.isFeatured,
      featuredOrder: o.featuredOrder,
      sortOrder: o.sortOrder,
      live: o.status === 'PUBLISHED' && (!o.publishedAt || o.publishedAt <= now),
    })),
    cityNames: cities.map((c) => c.name),
  };
}

type Context = { global: Global; markets: Map<string, Market> };

async function loadContext(countryIds?: Set<string>): Promise<Context> {
  const countries = await listCountries();
  const global = await loadGlobal(countries);
  const markets = new Map<string, Market>();
  for (const country of countries) {
    if (countryIds && !countryIds.has(country.id)) continue;
    markets.set(country.id, await loadMarket(country, global));
  }
  return { global, markets };
}

// ---------------------------------------------------------------------------
// Shared pieces of an input
// ---------------------------------------------------------------------------

function orgOf(local: CountrySettingsView) {
  return {
    name: local.organizationName || local.companyName,
    hasPhone: Boolean(local.salesPhone || local.supportPhone || local.whatsappNumber),
    hasEmail: Boolean(local.salesEmail || local.supportEmail),
    hasAddress: Boolean(local.addressLine1 || local.address || local.city),
  };
}

function renderedTitle(local: CountrySettingsView, raw: string, explicit: boolean): string {
  // The same template buildMetadata applies to a page's own title.
  return explicit && local.titleTemplate.includes('%s') ? local.titleTemplate.replace('%s', raw) : raw;
}

function noIndexOf(global: Global, market: Market, own: boolean): { noIndex: boolean; reason: string | null } {
  if (global.noIndexSite) return { noIndex: true, reason: 'the whole site is set to noindex' };
  if (market.local.noIndexCountry) return { noIndex: true, reason: `${market.country.name} is set to noindex` };
  if (own) return { noIndex: true, reason: 'this page is set to noindex' };
  return { noIndex: false, reason: null };
}

function sitemapState(global: Global, market: Market, live: boolean, noIndex: boolean, url: string) {
  const inSitemap = market.sitemapLocs.has(url.replace(/\/$/, ''));
  const reason = inSitemap
    ? null
    : !live
      ? 'it is not published'
      : noIndex
        ? 'it is set to noindex'
        : !global.sitemapEnabled
          ? 'the sitemap is switched off'
          : !market.country.isPublished
            ? `${market.country.name} is not published for search engines`
            : global.excluded.has(market.country.id)
              ? `${market.country.name} is excluded from the sitemap`
              : 'it is not listed';
  return { inSitemap, reason };
}

function productNamesFor(market: Market) {
  return (blockType: string, content: Record<string, unknown>): string[] => {
    const limit = Math.max(1, Math.min(12, Number(content.limit ?? 3) || 3));
    const live = market.catalogue.filter((p) => p.live);
    const source = String(content.source ?? 'featured');
    if (source === 'selected') {
      const ids = Array.isArray(content.productIds) ? content.productIds.map(String) : [];
      return ids.map((id) => live.find((p) => p.id === id)?.name).filter((n): n is string => Boolean(n));
    }
    if (source === 'featured') {
      return live.filter((p) => p.isFeatured).sort((a, b) => a.featuredOrder - b.featuredOrder).slice(0, limit).map((p) => p.name);
    }
    if (source === 'category' && typeof content.categoryId === 'string') {
      return live.filter((p) => p.categoryId === content.categoryId).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, limit).map((p) => p.name);
    }
    return [...live].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, limit).map((p) => p.name);
  };
}

function collectImageIds(value: unknown, out: Set<string>) {
  if (Array.isArray(value)) value.forEach((v) => collectImageIds(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'imageId' && typeof v === 'string' && v) out.add(v);
      else collectImageIds(v, out);
    }
  }
}

async function mediaAltFor(payloads: unknown[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const p of payloads) collectImageIds(p, ids);
  if (ids.size === 0) return new Map();
  const rows = await prisma.media.findMany({ where: { id: { in: [...ids] } }, select: { id: true, altText: true } });
  return new Map(rows.map((r) => [r.id, r.altText ?? '']));
}

async function routesFor(type: Prisma.UrlRouteWhereInput['contentType'], ids: string[]) {
  if (ids.length === 0) return new Map<string, { path: string; conflictPath: string | null; conflictReason: string | null }>();
  const rows = await prisma.urlRoute.findMany({
    where: { contentType: type, contentId: { in: ids } },
    select: { contentId: true, countryId: true, path: true, conflictPath: true, conflictReason: true },
  });
  return new Map(rows.map((r) => [`${r.contentId}:${r.countryId}`, r]));
}

function keysOf(input: Omit<AnalysisInput, 'duplicates'>, replace: string[]) {
  return {
    signature: minhashSignature(input.doc.body, replace),
    titleKey: input.title ? hashKey(normalise(input.title)) : null,
    descriptionKey: input.description ? hashKey(normalise(input.description)) : null,
    h1Key: input.doc.h1[0] ? hashKey(normalise(input.doc.h1[0])) : null,
  };
}

function structuredBase(market: Market): string[] {
  // Every public page carries the organisation and website schema from the layout.
  return [market.local.localBusinessType || market.local.organizationType || 'Organization', 'WebSite'];
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

async function preparePages(ctx: Context, where: Prisma.PageWhereInput): Promise<Prepared[]> {
  const out: Prepared[] = [];
  let cursor: string | undefined;
  for (;;) {
    const pages = await prisma.page.findMany({
      where: { deletedAt: null, ...where, countryId: { in: [...ctx.markets.keys()] } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        sections: { select: { blockType: true, content: true, isVisible: true, sortOrder: true } },
        city: { select: { id: true, name: true, region: true } },
        cityProduct: {
          select: {
            product: { select: { name: true } },
            city: { select: { id: true, name: true, region: true, page: { select: { status: true, publishedAt: true, deletedAt: true } } } },
          },
        },
      },
    });
    if (pages.length === 0) break;
    cursor = pages[pages.length - 1]!.id;

    const [routes, mediaAlt] = await Promise.all([
      routesFor('PAGE', pages.map((p) => p.id)),
      mediaAltFor(pages.flatMap((p) => p.sections.map((s) => s.content))),
    ]);
    const extraRoutes = await prisma.urlRoute.findMany({
      where: { contentType: { in: ['CATEGORY_PAGE', 'BRAND_PAGE'] }, contentId: { in: pages.map((p) => p.id) } },
      select: { contentId: true, countryId: true, path: true, conflictPath: true, conflictReason: true },
    });
    for (const r of extraRoutes) routes.set(`${r.contentId}:${r.countryId}`, r);

    for (const page of pages) {
      const market = ctx.markets.get(page.countryId);
      if (!market) continue;
      const { global } = ctx;
      const route = routes.get(`${page.id}:${page.countryId}`);
      const path = route?.path ?? countryPath(market.country, page.slug);
      const selfUrl = `${global.origin}${path === '/' ? '' : path}` || global.origin;
      const live = page.status === 'PUBLISHED' && (!page.publishedAt || page.publishedAt <= new Date());
      const idx = noIndexOf(global, market, page.noIndex);
      const doc = extractSections(page.sections, {
        mediaAlt,
        productNamesFor: productNamesFor(market),
        host: new URL(global.origin).hostname,
      });

      const cityInfo = page.city
        ? { kind: 'city' as const, id: page.city.id, name: page.city.name, region: page.city.region, productName: null, parentLive: true }
        : page.cityProduct
          ? {
              kind: 'cityProduct' as const,
              id: page.cityProduct.city.id,
              name: page.cityProduct.city.name,
              region: page.cityProduct.city.region,
              productName: page.cityProduct.product.name,
              parentLive: Boolean(
                page.cityProduct.city.page &&
                  !page.cityProduct.city.page.deletedAt &&
                  page.cityProduct.city.page.status === 'PUBLISHED',
              ),
            }
          : null;

      const structured = [...structuredBase(market)];
      if (page.slug !== '' && !page.isHomepage) structured.push('BreadcrumbList');
      if (doc.faq.length) structured.push('FAQPage');
      // City pages carry a Service with the city as its area served.
      if (cityInfo) structured.push('Service');

      const explicitTitle = Boolean(page.seoTitle?.trim());
      const rawTitle = page.seoTitle?.trim() || page.title;
      const input: Omit<AnalysisInput, 'duplicates'> = {
        entityType: cityInfo ? (cityInfo.kind === 'city' ? 'CITY_PAGE' : 'CITY_PRODUCT_PAGE') : 'PAGE',
        entityId: page.id,
        countryId: page.countryId,
        label: page.title,
        path,
        status: page.status,
        slug: page.slug,
        title: renderedTitle(market.local, rawTitle, true),
        titleIsExplicit: explicitTitle,
        description: page.seoDescription?.trim() || market.local.defaultDescription,
        descriptionIsExplicit: Boolean(page.seoDescription?.trim()),
        canonicalUrl: page.canonicalUrl?.trim() || null,
        selfUrl,
        noIndex: idx.noIndex,
        noIndexReason: idx.reason,
        ogTitle: true,
        ogImage: Boolean(page.ogImageId || market.local.defaultOgImageUrl || global.siteOgImage),
        keywords: page.primaryKeywords,
        doc,
        technical: {
          published: live,
          ...(() => {
            const s = sitemapState(global, market, live, idx.noIndex, selfUrl);
            return { inSitemap: s.inSitemap, sitemapReason: s.reason };
          })(),
          route: !route ? 'unregistered' : route.conflictPath ? 'conflict' : 'ok',
          routeNote: route?.conflictPath ? `${route.conflictPath}: ${route.conflictReason ?? 'held by another item'}` : null,
          robotsBlocked: robotsDisallows(global.robotsBody, path),
          structuredData: structured,
        },
        org: orgOf(market.local),
        market: { name: market.country.name, code: market.country.code },
        city: cityInfo
          ? { kind: cityInfo.kind, name: cityInfo.name, region: cityInfo.region, productName: cityInfo.productName, parentLive: cityInfo.parentLive }
          : null,
      };
      // City names are neutralised before comparing copy, so pages that differ
      // only by the city they name are recognised as the same page.
      const replace = cityInfo ? market.cityNames : [];
      out.push({ entityType: input.entityType, entityId: page.id, countryId: page.countryId, cityId: cityInfo?.id ?? null, input, ...keysOf(input, replace) });
    }
    if (pages.length < BATCH) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Products, per market
// ---------------------------------------------------------------------------

async function prepareProducts(ctx: Context, productIds?: string[]): Promise<Prepared[]> {
  const out: Prepared[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.productCountry.findMany({
      where: {
        deletedAt: null,
        countryId: { in: [...ctx.markets.keys()] },
        product: { deletedAt: null },
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        product: { include: { sections: { select: { blockType: true, content: true, isVisible: true, sortOrder: true } } } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    const [routes, mediaAlt] = await Promise.all([
      routesFor('PRODUCT', [...new Set(rows.map((r) => r.productId))]),
      mediaAltFor(rows.flatMap((r) => r.product.sections.map((s) => s.content))),
    ]);

    for (const row of rows) {
      const market = ctx.markets.get(row.countryId);
      if (!market) continue;
      const { global } = ctx;
      const product = row.product;
      const route = routes.get(`${product.id}:${row.countryId}`);
      const path = route?.path ?? countryPath(market.country, `products/${product.slug}`);
      const selfUrl = `${global.origin}${path}`;
      const live = row.status === 'PUBLISHED' && (!row.publishedAt || row.publishedAt <= new Date());
      const idx = noIndexOf(global, market, row.noIndex || product.noIndex);
      const sectionsDoc = extractSections(product.sections, {
        mediaAlt,
        productNamesFor: productNamesFor(market),
        host: new URL(global.origin).hostname,
      });
      const asStrings = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
      const specs = Array.isArray(product.specs)
        ? (product.specs as Array<{ label?: unknown; value?: unknown }>).map((s) => ({ label: String(s?.label ?? ''), value: String(s?.value ?? '') }))
        : [];
      const doc = withProductRecord(sectionsDoc, {
        name: product.name,
        summary: row.shortDescription || product.shortDescription || '',
        descriptionHtml: row.description || product.description || '',
        features: asStrings(product.features),
        benefits: asStrings(product.benefits),
        specs,
      });
      if (row.ctaLabel || product.ctaLabel || row.ctaFormId || product.ctaFormId) doc.hasCta = true;
      if (row.ctaFormId || product.ctaFormId) doc.hasForm = true;
      // The product page's breadcrumb trail links to the plans page.
      doc.links.push({ href: 'breadcrumb:plans', internal: true });

      const explicitTitle = Boolean((row.seoTitle || product.seoTitle)?.trim());
      const rawTitle = (row.seoTitle || product.seoTitle)?.trim() || product.name;
      const description = (row.seoDescription || product.seoDescription)?.trim() || row.shortDescription || product.shortDescription || market.local.defaultDescription;
      const structured = [...structuredBase(market), 'Product', 'BreadcrumbList'];
      if (doc.faq.length) structured.push('FAQPage');

      const input: Omit<AnalysisInput, 'duplicates'> = {
        entityType: 'PRODUCT',
        entityId: product.id,
        countryId: row.countryId,
        label: product.name,
        path,
        status: row.status,
        slug: product.slug,
        title: renderedTitle(market.local, rawTitle, true),
        titleIsExplicit: explicitTitle,
        description,
        descriptionIsExplicit: Boolean((row.seoDescription || product.seoDescription)?.trim()),
        canonicalUrl: (row.canonicalUrl || product.canonicalUrl)?.trim() || null,
        selfUrl,
        noIndex: idx.noIndex,
        noIndexReason: idx.reason,
        ogTitle: true,
        ogImage: Boolean(row.ogImageId || product.ogImageId || product.imageId || market.local.defaultOgImageUrl || global.siteOgImage),
        // A market's own keywords, else the product's.
        keywords: row.primaryKeywords.length ? row.primaryKeywords : product.primaryKeywords,
        doc,
        technical: {
          published: live,
          ...(() => {
            const s = sitemapState(global, market, live, idx.noIndex, selfUrl);
            return { inSitemap: s.inSitemap, sitemapReason: s.reason };
          })(),
          route: !route ? 'unregistered' : route.conflictPath ? 'conflict' : 'ok',
          routeNote: route?.conflictPath ? `${route.conflictPath}: ${route.conflictReason ?? 'held by another item'}` : null,
          robotsBlocked: robotsDisallows(global.robotsBody, path),
          structuredData: structured,
        },
        org: orgOf(market.local),
        market: { name: market.country.name, code: market.country.code },
        city: null,
      };
      out.push({ entityType: 'PRODUCT', entityId: product.id, countryId: row.countryId, cityId: null, input, ...keysOf(input, []) });
    }
    if (rows.length < BATCH) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blog posts (root market only)
// ---------------------------------------------------------------------------

async function preparePosts(ctx: Context, ids?: string[]): Promise<Prepared[]> {
  const root = [...ctx.markets.values()].find((m) => m.country.isDefault);
  if (!root) return [];
  const out: Prepared[] = [];
  let cursor: string | undefined;
  for (;;) {
    const posts = await prisma.blogPost.findMany({
      where: { deletedAt: null, countryId: root.country.id, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { sections: { select: { blockType: true, content: true, isVisible: true, sortOrder: true } } },
    });
    if (posts.length === 0) break;
    cursor = posts[posts.length - 1]!.id;
    const [routes, mediaAlt] = await Promise.all([
      routesFor('BLOG_POST', posts.map((p) => p.id)),
      mediaAltFor(posts.flatMap((p) => p.sections.map((s) => s.content))),
    ]);
    for (const post of posts) {
      const { global } = ctx;
      const route = routes.get(`${post.id}:${root.country.id}`);
      const path = route?.path ?? `/blog/${post.slug}`;
      const selfUrl = `${global.origin}${path}`;
      const live = post.status === 'PUBLISHED' && (!post.publishedAt || post.publishedAt <= new Date());
      const idx = noIndexOf(global, root, post.noIndex);
      // The article header owns the <h1>; its body is the rich text plus sections.
      const doc = extractSections(
        [{ blockType: 'richText', content: { content: post.content }, isVisible: true, sortOrder: -1 }, ...post.sections],
        { firstIsH1: false, mediaAlt, productNamesFor: productNamesFor(root), host: new URL(global.origin).hostname },
      );
      doc.h1.unshift(post.title);
      doc.headings.unshift({ level: 1, text: post.title });
      if (post.excerpt) {
        doc.firstText = `${post.excerpt} ${doc.firstText}`;
        doc.body = `${post.excerpt} ${doc.body}`;
      }
      const structured = [...structuredBase(root), 'BlogPosting', 'BreadcrumbList'];
      if (doc.faq.length) structured.push('FAQPage');
      const explicitTitle = Boolean(post.seoTitle?.trim());
      const input: Omit<AnalysisInput, 'duplicates'> = {
        entityType: 'BLOG_POST',
        entityId: post.id,
        countryId: root.country.id,
        label: post.title,
        path,
        status: post.status,
        slug: post.slug,
        title: renderedTitle(root.local, post.seoTitle?.trim() || post.title, true),
        titleIsExplicit: explicitTitle,
        description: post.seoDescription?.trim() || post.excerpt || root.local.defaultDescription,
        descriptionIsExplicit: Boolean(post.seoDescription?.trim()),
        canonicalUrl: post.canonicalUrl?.trim() || null,
        selfUrl,
        noIndex: idx.noIndex,
        noIndexReason: idx.reason,
        ogTitle: true,
        ogImage: Boolean(post.ogImageId || post.featuredImageId || root.local.defaultOgImageUrl || global.siteOgImage),
        // The blog already has a focus keyword; it is this article's primary keyword.
        keywords: post.focusKeyword?.trim() ? [post.focusKeyword.trim()] : [],
        doc,
        technical: {
          published: live,
          // The blog has its own sitemap file; an indexable live article is in it.
          inSitemap: live && !idx.noIndex && global.sitemapEnabled,
          sitemapReason: !live ? 'it is not published' : idx.noIndex ? 'it is set to noindex' : global.sitemapEnabled ? null : 'the sitemap is switched off',
          route: !route ? 'unregistered' : route.conflictPath ? 'conflict' : 'ok',
          routeNote: route?.conflictPath ? `${route.conflictPath}: ${route.conflictReason ?? 'held by another item'}` : null,
          robotsBlocked: robotsDisallows(global.robotsBody, path),
          structuredData: structured,
        },
        org: orgOf(root.local),
        market: { name: root.country.name, code: root.country.code },
        city: null,
      };
      out.push({ entityType: 'BLOG_POST', entityId: post.id, countryId: root.country.id, cityId: null, input, ...keysOf(input, []) });
    }
    if (posts.length < BATCH) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storing results
// ---------------------------------------------------------------------------

function contentHash(prepared: Prepared, duplicates: AnalysisInput['duplicates']): string {
  return hashKey(JSON.stringify({ v: RULES_VERSION, input: prepared.input, duplicates }));
}

async function store(prepared: Prepared[], comparables: Comparable[]) {
  const duplicates = findDuplicates(
    prepared.map((p) => ({
      key: `${p.entityType}:${p.entityId}:${p.countryId}`,
      label: p.input.label,
      countryId: p.countryId,
      titleKey: p.titleKey,
      descriptionKey: p.descriptionKey,
      h1Key: p.h1Key,
      signature: p.signature,
    })),
    comparables,
  );

  const rows = prepared.map((p) => {
    const dup = duplicates.get(`${p.entityType}:${p.entityId}:${p.countryId}`) ?? { titleWith: [], descriptionWith: [], h1With: [], similar: [] };
    const result = analyze({ ...p.input, duplicates: dup });
    return {
      where: { entityType_entityId_countryId: { entityType: p.entityType, entityId: p.entityId, countryId: p.countryId } },
      data: {
        entityType: p.entityType,
        entityId: p.entityId,
        countryId: p.countryId,
        cityId: p.cityId,
        label: p.input.label,
        path: p.input.path,
        status: p.input.status,
        seoScore: result.scores.seo,
        aeoScore: result.scores.aeo,
        geoScore: result.scores.geo,
        localScore: result.scores.local,
        overallScore: result.scores.overall,
        criticalCount: result.counts.critical,
        warningCount: result.counts.warning,
        passedCount: result.counts.passed,
        keywords: p.input.keywords,
        findings: result.findings as unknown as Prisma.InputJsonValue,
        signature: p.signature,
        titleKey: p.titleKey,
        descriptionKey: p.descriptionKey,
        h1Key: p.h1Key,
        contentHash: contentHash(p, dup),
        analyzedAt: new Date(),
      },
    };
  });

  for (let i = 0; i < rows.length; i += 50) {
    await prisma.$transaction(rows.slice(i, i + 50).map((r) => prisma.seoAnalysis.upsert({ where: r.where, create: r.data, update: r.data })));
  }
  return rows.length;
}

async function storedComparables(countryIds: string[], fresh: Prepared[]): Promise<Comparable[]> {
  const freshKeys = new Set(fresh.map((p) => `${p.entityType}:${p.entityId}:${p.countryId}`));
  const stored = await prisma.seoAnalysis.findMany({
    where: { countryId: { in: countryIds }, entityType: { not: 'SITE' } },
    select: { entityType: true, entityId: true, countryId: true, label: true, titleKey: true, descriptionKey: true, h1Key: true, signature: true },
  });
  return [
    ...stored
      .filter((s) => !freshKeys.has(`${s.entityType}:${s.entityId}:${s.countryId}`))
      .map((s) => ({ key: `${s.entityType}:${s.entityId}:${s.countryId}`, label: s.label, countryId: s.countryId, titleKey: s.titleKey, descriptionKey: s.descriptionKey, h1Key: s.h1Key, signature: s.signature })),
    ...fresh.map((p) => ({
      key: `${p.entityType}:${p.entityId}:${p.countryId}`,
      label: p.input.label,
      countryId: p.countryId,
      titleKey: p.titleKey,
      descriptionKey: p.descriptionKey,
      h1Key: p.h1Key,
      signature: p.signature,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Re-analyses some content, comparing it with the stored results of the rest
 * of its market. Content that no longer exists loses its stored rows.
 */
export async function analyzeTargets(targets: readonly Target[]): Promise<number> {
  if (targets.length === 0) return 0;
  const ctx = await loadContext();
  const pageIds = [...new Set(targets.filter((t) => t.kind === 'page').map((t) => t.id))];
  const productIds = [...new Set(targets.filter((t) => t.kind === 'product').map((t) => t.id))];
  const postIds = [...new Set(targets.filter((t) => t.kind === 'post').map((t) => t.id))];

  const prepared = [
    ...(pageIds.length ? await preparePages(ctx, { id: { in: pageIds } }) : []),
    ...(productIds.length ? await prepareProducts(ctx, productIds) : []),
    ...(postIds.length ? await preparePosts(ctx, postIds) : []),
  ];

  // Rows for content that is gone, withdrawn from a market or reclassified.
  const keep = new Set(prepared.map((p) => `${p.entityType}:${p.entityId}:${p.countryId}`));
  const existing = await prisma.seoAnalysis.findMany({
    where: { entityId: { in: [...pageIds, ...productIds, ...postIds] }, entityType: { not: 'SITE' } },
    select: { id: true, entityType: true, entityId: true, countryId: true },
  });
  const stale = existing.filter((r) => !keep.has(`${r.entityType}:${r.entityId}:${r.countryId}`)).map((r) => r.id);
  if (stale.length) await prisma.seoAnalysis.deleteMany({ where: { id: { in: stale } } });

  if (prepared.length === 0) return 0;
  const comparables = await storedComparables([...new Set(prepared.map((p) => p.countryId))], prepared);
  return store(prepared, comparables);
}

/** Analyses the whole site: every market's website checks and all content. */
export async function analyzeAll(): Promise<{ analyzed: number; removed: number }> {
  const ctx = await loadContext();
  const prepared = [...(await preparePages(ctx, {})), ...(await prepareProducts(ctx)), ...(await preparePosts(ctx))];
  const comparables = prepared.map((p) => ({
    key: `${p.entityType}:${p.entityId}:${p.countryId}`,
    label: p.input.label,
    countryId: p.countryId,
    titleKey: p.titleKey,
    descriptionKey: p.descriptionKey,
    h1Key: p.h1Key,
    signature: p.signature,
  }));
  const analyzed = await store(prepared, comparables);
  const siteRows = await storeSites(ctx);

  const keep = new Set([...prepared.map((p) => `${p.entityType}:${p.entityId}:${p.countryId}`), ...siteRows]);
  const all = await prisma.seoAnalysis.findMany({ select: { id: true, entityType: true, entityId: true, countryId: true } });
  const stale = all.filter((r) => !keep.has(`${r.entityType}:${r.entityId}:${r.countryId}`)).map((r) => r.id);
  if (stale.length) await prisma.seoAnalysis.deleteMany({ where: { id: { in: stale } } });
  return { analyzed: analyzed + siteRows.length, removed: stale.length };
}

/**
 * The website row for each market: its site-wide checks as the SEO score,
 * and the average AEO and GEO of its content.
 */
async function storeSites(ctx: Context): Promise<string[]> {
  const keys: string[] = [];
  const [averages, homepages] = await Promise.all([
    prisma.seoAnalysis.groupBy({
      by: ['countryId'],
      where: { entityType: { not: 'SITE' } },
      _avg: { aeoScore: true, geoScore: true },
    }),
    prisma.page.findMany({
      where: { deletedAt: null, isHomepage: true, status: 'PUBLISHED' },
      select: { countryId: true },
    }),
  ]);
  const avg = new Map(averages.map((a) => [a.countryId, a._avg]));
  const withHome = new Set(homepages.map((h) => h.countryId));

  for (const market of ctx.markets.values()) {
    const { country, local } = market;
    const org = orgOf(local);
    const findings: Finding[] = siteFindings({
      market: { name: country.name, isPublished: country.isPublished && country.isActive },
      noIndexSite: ctx.global.noIndexSite,
      noIndexCountry: local.noIndexCountry,
      sitemapEnabled: ctx.global.sitemapEnabled,
      excludeFromSitemap: ctx.global.excluded.has(country.id),
      sitemapUrlCount: market.sitemapLocs.size,
      robotsErrors: ctx.global.robotsErrors,
      robotsWarnings: ctx.global.robotsWarnings,
      homepagePublished: withHome.has(country.id),
      defaultTitle: local.defaultTitle,
      defaultDescription: local.defaultDescription,
      org: { ...org, hasLogo: Boolean(local.organizationLogoUrl) },
      verification: ctx.global.verification,
      defaultOgImage: Boolean(local.defaultOgImageUrl || ctx.global.siteOgImage),
    });
    const seo = scoreOf(findings);
    const a = avg.get(country.id);
    const aeo = Math.round(a?.aeoScore ?? 0);
    const geo = Math.round(a?.geoScore ?? 0);
    const counts = countFindings(findings);
    const data = {
      entityType: 'SITE',
      entityId: 'site',
      countryId: country.id,
      cityId: null,
      label: `${ctx.global.siteName} — ${country.name}`,
      path: countryPath(country, ''),
      status: country.isActive ? (country.isPublished ? 'PUBLISHED' : 'DRAFT') : 'ARCHIVED',
      seoScore: seo,
      aeoScore: aeo,
      geoScore: geo,
      localScore: null,
      overallScore: combine(seo, aeo, geo),
      criticalCount: counts.critical,
      warningCount: counts.warning,
      passedCount: counts.passed,
      keywords: [],
      findings: findings as unknown as Prisma.InputJsonValue,
      signature: [],
      titleKey: null,
      descriptionKey: null,
      h1Key: null,
      contentHash: hashKey(JSON.stringify({ v: RULES_VERSION, findings, aeo, geo })),
      analyzedAt: new Date(),
    };
    await prisma.seoAnalysis.upsert({
      where: { entityType_entityId_countryId: { entityType: 'SITE', entityId: 'site', countryId: country.id } },
      create: data,
      update: data,
    });
    keys.push(`SITE:site:${country.id}`);
  }
  return keys;
}
