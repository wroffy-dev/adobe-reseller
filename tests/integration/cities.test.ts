import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, ensureTestCountry, ensureSecondCountry, formData } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createCity, updateCity, generateCityProductPages, setCityActive, deleteCity, checkCityAddress } = await import('@/lib/actions/cities');
const { updatePage, updateSection } = await import('@/lib/actions/pages');
const { resolvePublicRequest } = await import('@/lib/urls/resolver');
const { countryUrls } = await import('@/lib/seo/sitemap');
const { listCountries, invalidateCountryCache } = await import('@/lib/country/registry');
const { analyzeTargets, analyzeAll } = await import('@/lib/seo-intelligence/collect');
const { cmsPageMetadata } = await import('@/app/(public)/_surfaces/cms-page');

/**
 * Cities against a real database: pages created through the page system,
 * addresses through the URL registry, prices from ProductCountry only, and
 * SEO Intelligence results stored per market.
 */

const suffix = uniqueSuffix();
const delhi = `delhi-${suffix}`;
const gurugram = `gurugram-${suffix}`;
const dubai = `dubai-${suffix}`;
let india = '';
let uae = '';
let productId = '';
let uaeOnlyId = '';
let resolverBefore = false;
const cityIds: string[] = [];
const pageIds = new Set<string>();

const created = async (input: Record<string, unknown>) => {
  const result = await createCity(input);
  if (result.ok && result.data) {
    cityIds.push(result.data.id);
    if (result.data.pageId) pageIds.add(result.data.pageId);
  }
  return result;
};

const routeOf = (pageId: string) =>
  prisma.urlRoute.findFirst({ where: { contentType: 'PAGE', contentId: pageId }, select: { path: true, isPublic: true } });

beforeAll(async () => {
  india = await ensureTestCountry();
  uae = await ensureSecondCountry();
  invalidateCountryCache();
  await listCountries();

  const settings = await prisma.urlSettings.findUnique({ where: { id: 'singleton' } });
  resolverBefore = Boolean(settings?.resolverEnabled);
  await prisma.urlSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', resolverEnabled: true }, update: { resolverEnabled: true } });

  const product = await prisma.product.create({
    data: { name: `Acrobat ${suffix}`, slug: `acrobat-${suffix}`, status: 'PUBLISHED', features: [], benefits: [], specs: [], galleryIds: [], primaryKeywords: ['acrobat global'] },
  });
  productId = product.id;
  await prisma.productCountry.createMany({
    data: [
      { productId, countryId: india, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), monthlyPrice: 999, primaryKeywords: ['Acrobat price India'] },
      { productId, countryId: uae, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), currency: 'AED', monthlyPrice: 49 },
    ],
  });
  const uaeOnly = await prisma.product.create({
    data: { name: `Express ${suffix}`, slug: `express-${suffix}`, status: 'PUBLISHED', features: [], benefits: [], specs: [], galleryIds: [] },
  });
  uaeOnlyId = uaeOnly.id;
  await prisma.productCountry.create({ data: { productId: uaeOnlyId, countryId: uae, status: 'PUBLISHED', currency: 'AED' } });
});

afterAll(async () => {
  const mappings = await prisma.cityProductPage.findMany({ where: { cityId: { in: cityIds } }, select: { pageId: true } });
  for (const m of mappings) pageIds.add(m.pageId);
  const extra = await prisma.page.findMany({ where: { slug: { contains: suffix } }, select: { id: true } });
  for (const p of extra) pageIds.add(p.id);
  const ids = [...pageIds, productId, uaeOnlyId];
  const routes = await prisma.urlRoute.findMany({ where: { contentId: { in: ids } }, select: { id: true } });
  await prisma.redirect.deleteMany({ where: { OR: [{ targetRouteId: { in: routes.map((r) => r.id) } }, { source: { contains: suffix } }] } });
  await prisma.urlChange.deleteMany({ where: { OR: [{ contentId: { in: ids } }, { oldPath: { contains: suffix } }] } });
  await prisma.urlRoute.deleteMany({ where: { contentId: { in: ids } } });
  await prisma.seoAnalysis.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.city.deleteMany({ where: { id: { in: cityIds } } });
  await prisma.page.deleteMany({ where: { id: { in: [...pageIds] } } });
  await prisma.productCountry.deleteMany({ where: { productId: { in: [productId, uaeOnlyId] } } });
  await prisma.product.deleteMany({ where: { id: { in: [productId, uaeOnlyId] } } });
  await prisma.urlSettings.update({ where: { id: 'singleton' }, data: { resolverEnabled: resolverBefore } });
});

describe('creating a city', () => {
  it('creates the city and a real, editable CMS page at /<slug>', async () => {
    const result = await created({ countryId: india, name: 'Delhi', slug: delhi, page: { createPage: true, status: 'PUBLISHED' } });
    expect(result.ok).toBe(true);
    const city = await prisma.city.findUniqueOrThrow({ where: { id: cityIds[0]! }, include: { page: { include: { sections: true } } } });
    expect(city.region).toBeNull();
    expect(city.page).toMatchObject({ slug: delhi, countryId: india, title: 'Delhi', status: 'PUBLISHED' });
    expect(city.page!.seoTitle).toBe('Adobe Reseller in Delhi | Adobe Licensing Partner');
    expect(city.page!.primaryKeywords).toEqual(['Adobe reseller in Delhi', 'Adobe partner in Delhi', 'Adobe licenses in Delhi']);
    expect(city.page!.sections.map((s) => s.blockType)).toEqual(['hero', 'richText', 'productCards', 'faq', 'cta']);
    expect((await routeOf(city.pageId!))?.path).toBe(`/${delhi}`);
  });

  it('keeps the admin’s own SEO values instead of the suggestions', async () => {
    const result = await created({
      countryId: india,
      name: 'Gurugram',
      slug: gurugram,
      region: 'Haryana',
      page: { createPage: true, status: 'PUBLISHED', seoTitle: 'My title', keywords: ['one', 'two', 'three', 'four'] },
    });
    expect(result.ok).toBe(true);
    const page = await prisma.page.findUniqueOrThrow({ where: { id: result.ok ? result.data!.pageId! : '' } });
    expect(page.seoTitle).toBe('My title');
    expect(page.primaryKeywords).toEqual(['one', 'two', 'three']);
  });

  it('refuses a slug the city’s market already uses', async () => {
    const duplicate = await createCity({ countryId: india, name: 'Delhi again', slug: delhi });
    expect(duplicate.ok).toBe(false);
  });

  it('allows the same slug in another market, under its prefix', async () => {
    const result = await created({ countryId: uae, name: 'Dubai', slug: delhi, page: { createPage: true, status: 'DRAFT' } });
    expect(result.ok).toBe(true);
    const pageId = result.ok ? result.data!.pageId! : '';
    expect((await routeOf(pageId))?.path).toBe(`/ae/${delhi}`);
    // Tidy: this city exists only to prove isolation.
    await deleteCity(cityIds[cityIds.length - 1]!);
  });

  it('checks the URL registry for collisions and reserved paths before saving', async () => {
    const page = await prisma.page.create({ data: { countryId: india, title: 'Clash', slug: `clash-${suffix}`, status: 'PUBLISHED' } });
    pageIds.add(page.id);
    const clash = await createCity({ countryId: india, name: 'Clash', slug: `clash-${suffix}` });
    expect(clash.ok).toBe(false);
    const reserved = await createCity({ countryId: india, name: 'Admin', slug: 'admin' });
    expect(reserved.ok).toBe(false);
    const check = await checkCityAddress({ countryId: uae, slug: dubai });
    expect(check.ok && check.data).toMatchObject({ path: `/ae/${dubai}`, available: true });
  });
});

describe('independent editing', () => {
  it('never changes one city’s page when another is edited', async () => {
    const [a, b] = await prisma.page.findMany({
      where: { slug: { in: [delhi, gurugram] }, countryId: india },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { slug: 'asc' },
    });
    const intro = a!.sections.find((s) => s.blockType === 'richText')!;
    const result = await updateSection(intro.id, { content: { heading: 'Only in Delhi', content: '<p>Delhi-specific copy.</p>' } });
    expect(result.ok).toBe(true);
    const other = await prisma.pageSection.findFirstOrThrow({ where: { pageId: b!.id, blockType: 'richText' } });
    expect(JSON.stringify(other.content)).not.toContain('Only in Delhi');
  });
});

describe('city product pages', () => {
  let delhiId = '';
  beforeAll(async () => {
    delhiId = (await prisma.city.findFirstOrThrow({ where: { countryId: india, slug: delhi } })).id;
  });

  it('creates /<city>/<product> pages for products the market sells', async () => {
    const result = await generateCityProductPages({ cityId: delhiId, productIds: [productId], status: 'PUBLISHED' });
    expect(result.ok).toBe(true);
    const mapping = await prisma.cityProductPage.findFirstOrThrow({ where: { cityId: delhiId, productId }, include: { page: true } });
    expect(mapping.page.slug).toBe(`${delhi}/acrobat-${suffix}`);
    expect((await routeOf(mapping.pageId))?.path).toBe(`/${delhi}/acrobat-${suffix}`);
    const served = await resolvePublicRequest(`${delhi}/acrobat-${suffix}`);
    expect(served.kind).toBe('route');
  });

  it('never creates a second page for the same city and product', async () => {
    const again = await generateCityProductPages({ cityId: delhiId, productIds: [productId] });
    expect(again.ok).toBe(false);
    expect(await prisma.cityProductPage.count({ where: { cityId: delhiId, productId } })).toBe(1);
  });

  it('refuses a product the city’s market does not sell', async () => {
    const result = await generateCityProductPages({ cityId: delhiId, productIds: [uaeOnlyId] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not sold in India/);
  });

  it('keeps prices in ProductCountry only', async () => {
    const columns = Object.keys(await prisma.cityProductPage.findFirstOrThrow({ where: { cityId: delhiId } }));
    expect(columns.some((c) => /price|currency/i.test(c))).toBe(false);
    const page = await prisma.page.findFirstOrThrow({ where: { slug: `${delhi}/acrobat-${suffix}` }, include: { sections: true } });
    const pricing = page.sections.find((s) => s.blockType === 'productCards')!;
    expect(pricing.content).toMatchObject({ source: 'selected', productIds: [productId] });
    expect(JSON.stringify(page.sections)).not.toContain('999');
  });
});

describe('sitemap', () => {
  it('lists published city and city product pages through the existing sitemap', async () => {
    const countries = await listCountries();
    const urls = (await countryUrls(countries.find((c) => c.id === india)!)).map((u) => u.loc);
    expect(urls.some((u) => u.endsWith(`/${delhi}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/${delhi}/acrobat-${suffix}`))).toBe(true);
  });

  it('leaves drafts out', async () => {
    const draft = await created({ countryId: uae, name: 'Dubai', slug: dubai, page: { createPage: true, status: 'DRAFT' } });
    expect(draft.ok).toBe(true);
    const countries = await listCountries();
    const urls = (await countryUrls(countries.find((c) => c.id === uae)!)).map((u) => u.loc);
    expect(urls.some((u) => u.endsWith(`/ae/${dubai}`))).toBe(false);
  });
});

describe('moving a city', () => {
  it('moves the city page and its product pages, with permanent redirects from the old addresses', async () => {
    const city = await prisma.city.findFirstOrThrow({ where: { countryId: india, slug: delhi } });
    const moved = `new-${delhi}`;
    const result = await updateCity(city.id, { name: 'New Delhi', slug: moved, region: '', sortOrder: 0 });
    expect(result.ok).toBe(true);

    expect((await routeOf(city.pageId!))?.path).toBe(`/${moved}`);
    const child = await prisma.page.findFirstOrThrow({ where: { slug: `${moved}/acrobat-${suffix}` } });
    expect((await routeOf(child.id))?.path).toBe(`/${moved}/acrobat-${suffix}`);

    expect(await resolvePublicRequest(delhi)).toMatchObject({ kind: 'redirect', destination: `/${moved}`, permanent: true });
    expect(await resolvePublicRequest(`${delhi}/acrobat-${suffix}`)).toMatchObject({
      kind: 'redirect',
      destination: `/${moved}/acrobat-${suffix}`,
      permanent: true,
    });
  });

  it('follows its landing page when that page is renamed in the page editor', async () => {
    const city = await prisma.city.findFirstOrThrow({ where: { countryId: india, slug: `new-${delhi}` }, include: { page: true } });
    const page = city.page!;
    const renamed = `nd-${suffix}`;
    const result = await updatePage(page.id, formData({ title: page.title, slug: renamed, status: page.status, seoTitle: page.seoTitle ?? '' }));
    expect(result.ok).toBe(true);
    expect((await prisma.city.findUniqueOrThrow({ where: { id: city.id } })).slug).toBe(renamed);
    expect(await prisma.page.count({ where: { slug: `${renamed}/acrobat-${suffix}` } })).toBe(1);
  });

  it('archives a city by taking its pages off the website, and restores them as drafts', async () => {
    const city = await prisma.city.findFirstOrThrow({ where: { countryId: india, slug: gurugram } });
    expect((await setCityActive(city.id, false)).ok).toBe(true);
    expect((await prisma.page.findUniqueOrThrow({ where: { id: city.pageId! } })).status).toBe('ARCHIVED');
    expect((await setCityActive(city.id, true)).ok).toBe(true);
    expect((await prisma.page.findUniqueOrThrow({ where: { id: city.pageId! } })).status).toBe('DRAFT');
  });
});

describe('SEO Intelligence storage', () => {
  it('stores a city page’s scores, local score and keywords', async () => {
    const city = await prisma.city.findFirstOrThrow({ where: { countryId: india, slug: `nd-${suffix}` } });
    await analyzeTargets([{ kind: 'page', id: city.pageId! }]);
    const row = await prisma.seoAnalysis.findFirstOrThrow({ where: { entityId: city.pageId!, entityType: 'CITY_PAGE' } });
    expect(row.cityId).toBe(city.id);
    expect(row.localScore).not.toBeNull();
    expect(row.keywords).toEqual(['Adobe reseller in Delhi', 'Adobe partner in Delhi', 'Adobe licenses in Delhi']);
    expect(row.overallScore).toBe(Math.round(row.seoScore * 0.5 + row.aeoScore * 0.25 + row.geoScore * 0.25));
    const findings = row.findings as Array<{ id: string; passed: boolean }>;
    expect(findings.find((f) => f.id === 'tech.sitemap')?.passed).toBe(true);
  });

  it('marks noindex pages and their absence from the sitemap', async () => {
    const page = await prisma.page.create({
      data: { countryId: india, title: 'Hidden', slug: `hidden-${suffix}`, status: 'PUBLISHED', noIndex: true },
    });
    pageIds.add(page.id);
    await analyzeTargets([{ kind: 'page', id: page.id }]);
    const row = await prisma.seoAnalysis.findFirstOrThrow({ where: { entityId: page.id } });
    const findings = row.findings as Array<{ id: string; passed: boolean; description: string }>;
    expect(findings.find((f) => f.id === 'meta.indexable')?.passed).toBe(false);
    expect(findings.find((f) => f.id === 'tech.sitemap')).toMatchObject({ passed: false });
  });

  it('scores a product once per market, against that market’s keywords', async () => {
    await analyzeTargets([{ kind: 'product', id: productId }]);
    const rows = await prisma.seoAnalysis.findMany({ where: { entityId: productId, entityType: 'PRODUCT' } });
    expect(rows.map((r) => r.countryId).sort()).toEqual([india, uae].sort());
    expect(rows.find((r) => r.countryId === india)?.keywords).toEqual(['Acrobat price India']);
    expect(rows.find((r) => r.countryId === uae)?.keywords).toEqual(['acrobat global']);
  });

  it('flags city pages whose copy differs only by the city name', async () => {
    const gurugramPage = await prisma.page.findFirstOrThrow({ where: { slug: gurugram, countryId: india } });
    await setCityActive((await prisma.city.findFirstOrThrow({ where: { pageId: gurugramPage.id } })).id, true);
    // A third city from the same starter layout, compared with Gurugram's.
    const third = await created({ countryId: india, name: 'Noida', slug: `noida-${suffix}`, page: { createPage: true, status: 'DRAFT' } });
    expect(third.ok).toBe(true);
    await analyzeTargets([{ kind: 'page', id: gurugramPage.id }]);
    await analyzeTargets([{ kind: 'page', id: third.ok ? third.data!.pageId! : '' }]);
    const row = await prisma.seoAnalysis.findFirstOrThrow({ where: { entityId: third.ok ? third.data!.pageId! : '' } });
    const unique = (row.findings as Array<{ id: string; passed: boolean }>).find((f) => f.id === 'local.unique');
    expect(unique?.passed).toBe(false);
  });

  it('recalculates the whole site, including a website row per market', async () => {
    const result = await analyzeAll();
    expect(result.analyzed).toBeGreaterThan(0);
    expect(await prisma.seoAnalysis.count({ where: { entityType: 'SITE', countryId: india } })).toBe(1);
  });
});

describe('metadata', () => {
  it('emits the primary keywords as meta keywords', async () => {
    const countries = await listCountries();
    const metadata = await cmsPageMetadata(countries.find((c) => c.id === india)!, gurugram);
    // Gurugram's page was restored as a draft; publish it for the public surface.
    expect(metadata.title).toBeDefined();
    const page = await prisma.page.findFirstOrThrow({ where: { slug: gurugram, countryId: india } });
    await prisma.page.update({ where: { id: page.id }, data: { status: 'PUBLISHED' } });
    const live = await cmsPageMetadata(countries.find((c) => c.id === india)!, gurugram);
    expect(live.keywords).toEqual(['one', 'two', 'three']);
  });
});
