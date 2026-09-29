import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, ensureTestCountry, ensureSecondCountry } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { syncContentRoutes, checkSlugAvailability } = await import('@/lib/urls/registry');
const { previewEdits, applyEdits, restoreEdit, importCsv, previewPattern, applyPatternChange, saveRedirect, listRoutes } = await import(
  '@/lib/urls/manager'
);
const { resolvePublicRequest } = await import('@/lib/urls/resolver');
const { countryUrls } = await import('@/lib/seo/sitemap');
const { listCountries, invalidateCountryCache } = await import('@/lib/country/registry');

/**
 * The URL registry against a real database: every acceptance rule of the
 * Slug & URL Manager that can be checked without a browser.
 */

const suffix = uniqueSuffix();
const slug = `url-${suffix}`;
let india = '';
let uae = '';
let productId = '';
let draftId = '';
let pageId = '';
let resolverBefore = false;

const route = (countryId: string, contentId = productId) =>
  prisma.urlRoute.findUniqueOrThrow({
    where: { contentType_contentId_countryId: { contentType: 'PRODUCT', contentId, countryId } },
  });

async function move(routeId: string, path: string, allowed: string[] | null = null) {
  const edits = [{ routeId, action: 'custom' as const, path }];
  const preview = await previewEdits(edits, allowed);
  return applyEdits(edits, { token: preview.token, actor: null, allowed });
}

beforeAll(async () => {
  india = await ensureTestCountry();
  uae = await ensureSecondCountry();
  invalidateCountryCache();
  await listCountries();

  const settings = await prisma.urlSettings.findUnique({ where: { id: 'singleton' } });
  resolverBefore = Boolean(settings?.resolverEnabled);
  await prisma.urlSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', resolverEnabled: true },
    update: { resolverEnabled: true },
  });

  const product = await prisma.product.create({
    data: { name: `URL plan ${suffix}`, slug, status: 'PUBLISHED', features: [], benefits: [], specs: [], galleryIds: [] },
  });
  productId = product.id;
  await prisma.productCountry.createMany({
    data: [
      { productId, countryId: india, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) },
      { productId, countryId: uae, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), currency: 'AED' },
    ],
  });
  const draft = await prisma.product.create({
    data: { name: `URL draft ${suffix}`, slug: `${slug}-draft`, status: 'DRAFT', features: [], benefits: [], specs: [], galleryIds: [] },
  });
  draftId = draft.id;
  await prisma.productCountry.create({ data: { productId: draftId, countryId: india, status: 'DRAFT' } });

  const page = await prisma.page.create({
    data: { countryId: india, title: `URL page ${suffix}`, slug: `pg-${suffix}`, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) },
  });
  pageId = page.id;

  await syncContentRoutes({ contents: [{ kind: 'product', id: productId }, { kind: 'product', id: draftId }, { kind: 'page', id: pageId }] }, null, 'created');
});

afterAll(async () => {
  const ids = [productId, draftId, pageId].filter(Boolean);
  const routes = await prisma.urlRoute.findMany({ where: { contentId: { in: ids } }, select: { id: true, path: true } });
  await prisma.redirect.deleteMany({
    where: { OR: [{ targetRouteId: { in: routes.map((r) => r.id) } }, { source: { contains: suffix } }] },
  });
  await prisma.urlChange.deleteMany({ where: { OR: [{ contentId: { in: ids } }, { oldPath: { contains: suffix } }] } });
  await prisma.urlRoute.deleteMany({ where: { contentId: { in: ids } } });
  await prisma.urlPattern.deleteMany({ where: { contentType: 'PRODUCT', countryId: uae } });
  await prisma.productCountry.deleteMany({ where: { productId: { in: [productId, draftId] } } });
  await prisma.product.deleteMany({ where: { id: { in: [productId, draftId] } } });
  await prisma.page.deleteMany({ where: { id: pageId } });
  await prisma.urlSettings.update({ where: { id: 'singleton' }, data: { resolverEnabled: resolverBefore } });
});

describe('registration', () => {
  it('registers each market’s current address without changing it', async () => {
    expect((await route(india)).path).toBe(`/products/${slug}`);
    expect((await route(uae)).path).toBe(`/ae/products/${slug}`);
    expect((await route(india)).isPublic).toBe(true);
  });

  it('is idempotent', async () => {
    const report = await syncContentRoutes({ kind: 'product', ids: [productId] }, null);
    expect(report?.created).toBe(0);
    expect(report?.moved).toBe(0);
  });
});

describe('moving a product to the root', () => {
  it('serves /slug and answers the old address with one permanent redirect to it', async () => {
    const result = await move((await route(india)).id, `/${slug}`);
    expect(result.moved).toBe(1);
    expect(result.redirects).toBe(1);

    const served = await resolvePublicRequest(slug);
    expect(served.kind).toBe('route');
    if (served.kind === 'route') expect(served.route.contentId).toBe(productId);

    const old = await resolvePublicRequest(`products/${slug}`);
    expect(old).toMatchObject({ kind: 'redirect', destination: `/${slug}`, permanent: true });
  });

  it('leaves the UAE address alone', async () => {
    expect((await route(uae)).path).toBe(`/ae/products/${slug}`);
    const uaeServed = await resolvePublicRequest(`ae/products/${slug}`);
    expect(uaeServed.kind).toBe('route');
  });

  it('redirects a differently-cased spelling to the canonical one', async () => {
    const upper = await resolvePublicRequest(slug.toUpperCase());
    expect(upper).toMatchObject({ kind: 'redirect', destination: `/${slug}` });
  });

  it('lists the new address in the sitemap', async () => {
    const countries = await listCountries();
    const urls = await countryUrls(countries.find((c) => c.id === india)!);
    expect(urls.some((u) => u.loc.endsWith(`/${slug}`))).toBe(true);
    expect(urls.some((u) => u.loc.endsWith(`/products/${slug}`))).toBe(false);
  });
});

describe('repeated renames', () => {
  it('points every earlier address straight at the newest, with no chain', async () => {
    await move((await route(india)).id, `/software/${slug}`);
    const redirects = await prisma.redirect.findMany({ where: { targetRouteId: (await route(india)).id } });
    expect(redirects.map((r) => r.source).sort()).toEqual([`/${slug}`, `/products/${slug}`].sort());
    for (const r of redirects) expect(r.destination).toBe(`/software/${slug}`);
    expect(await resolvePublicRequest(`products/${slug}`)).toMatchObject({ kind: 'redirect', destination: `/software/${slug}` });
  });

  it('restores an earlier address from history, repairing the reverse redirect', async () => {
    const change = await prisma.urlChange.findFirstOrThrow({
      where: { contentId: productId, oldPath: `/${slug}`, newPath: `/software/${slug}` },
    });
    const edit = await restoreEdit(change.id, null);
    const preview = await previewEdits([edit], null);
    await applyEdits([edit], { token: preview.token, actor: null, allowed: null, action: 'restored' });

    expect((await route(india)).path).toBe(`/${slug}`);
    // The redirect that used to send /slug away is gone; the one it came from now leads back.
    expect(await prisma.redirect.findUnique({ where: { sourceKey: `/${slug}` } })).toBeNull();
    const back = await prisma.redirect.findUniqueOrThrow({ where: { sourceKey: `/software/${slug}` } });
    expect(back.destination).toBe(`/${slug}`);
    expect((await prisma.redirect.findUniqueOrThrow({ where: { sourceKey: `/products/${slug}` } })).destination).toBe(`/${slug}`);
  });
});

describe('conflicts', () => {
  it('refuses an address another content type owns, naming it', async () => {
    const preview = await previewEdits([{ routeId: (await route(uae)).id, action: 'custom', path: '/x' }], null);
    expect(preview.errors).toHaveLength(0);

    const indiaRoute = await route(india);
    const clash = await previewEdits([{ routeId: indiaRoute.id, action: 'custom', path: `/pg-${suffix}` }], null);
    const item = clash.items.find((i) => i.routeId === indiaRoute.id);
    expect(item?.status).toBe('conflict');
    expect(item?.reason).toContain(`URL page ${suffix}`);
    await expect(applyEdits([{ routeId: indiaRoute.id, action: 'custom', path: `/pg-${suffix}` }], { token: clash.token, actor: null, allowed: null })).rejects.toThrow(/conflict/);
    expect((await route(india)).path).toBe(`/${slug}`);
  });

  it('refuses reserved routes and traversal', async () => {
    const id = (await route(india)).id;
    const reserved = await previewEdits([{ routeId: id, action: 'custom', path: '/admin/anything' }], null);
    expect(reserved.items.find((i) => i.routeId === id)?.reason).toMatch(/system route/);
    const blog = await previewEdits([{ routeId: id, action: 'custom', path: '/blog' }], null);
    expect(blog.items.find((i) => i.routeId === id)?.reason).toMatch(/blog archive/);
    const market = await previewEdits([{ routeId: id, action: 'custom', path: '/ae/stolen' }], null);
    // "/ae/…" typed for an Indian URL is read as the Indian path "/ae/stolen", which the UAE prefix owns.
    expect(market.items.find((i) => i.routeId === id)?.reason).toMatch(/market prefix/);
    const traversal = await previewEdits([{ routeId: id, action: 'custom', path: '/a/../b' }], null);
    expect(traversal.errors[0]?.message).toMatch(/Dot segments/);
  });

  it('refuses a redirect over a live page, and a live page over a redirect', async () => {
    await expect(saveRedirect({ source: `/${slug}`, destination: '/elsewhere', type: 'PERMANENT', isActive: true }, null, null)).rejects.toThrow(/live address/);
    await saveRedirect({ source: `/held-${suffix}`, destination: '/contact', type: 'TEMPORARY', isActive: true }, null, null);
    const preview = await previewEdits([{ routeId: (await route(uae)).id, action: 'custom', path: `/held-${suffix}` }], null);
    // The UAE route's path would be /ae/held-…, which is free; the Indian one is not.
    expect(preview.items.find((i) => i.status === 'conflict')).toBeUndefined();
    const indian = await previewEdits([{ routeId: (await route(india)).id, action: 'custom', path: `/held-${suffix}` }], null);
    expect(indian.items.find((i) => i.status === 'conflict')?.reason).toMatch(/redirect/);
  });

  it('lets exactly one of two concurrent saves take an address', async () => {
    const target = `/race-${suffix}`;
    const a = (await route(india)).id;
    const b = (await route(india, draftId)).id;
    const [pa, pb] = await Promise.all([
      previewEdits([{ routeId: a, action: 'custom', path: target }], null),
      previewEdits([{ routeId: b, action: 'custom', path: target }], null),
    ]);
    const results = await Promise.allSettled([
      applyEdits([{ routeId: a, action: 'custom', path: target }], { token: pa.token, actor: null, allowed: null }),
      applyEdits([{ routeId: b, action: 'custom', path: target }], { token: pb.token, actor: null, allowed: null }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.urlRoute.count({ where: { pathKey: target } })).toBe(1);
    // Put the winner back where the rest of the suite expects it.
    const winner = await prisma.urlRoute.findUniqueOrThrow({ where: { pathKey: target } });
    if (winner.contentId === productId) await move(winner.id, `/${slug}`);
    else await move(winner.id, `/products/${slug}-draft`);
  });

  it('refuses a stale preview', async () => {
    const id = (await route(uae)).id;
    const stale = await previewEdits([{ routeId: id, action: 'custom', path: `/stale-${suffix}` }], null);
    await move(id, `/fresh-${suffix}`);
    await expect(applyEdits([{ routeId: id, action: 'custom', path: `/stale-${suffix}` }], { token: stale.token, actor: null, allowed: null })).rejects.toThrow(/changed since the preview/);
    await move(id, `/products/${slug}`);
  });

  it('checks a content slug edit against every type before it is saved', async () => {
    const result = await checkSlugAvailability({ kind: 'page', contentId: pageId, slug: slug });
    expect(result.ok).toBe(false);
  });
});

describe('drafts', () => {
  it('moves a draft without leaving a redirect, and never exposes it through a legacy address', async () => {
    const id = (await route(india, draftId)).id;
    const result = await move(id, `/draft-${suffix}`);
    expect(result.redirects).toBe(0);
    expect(await prisma.redirect.count({ where: { targetRouteId: id } })).toBe(0);
    const legacy = await resolvePublicRequest(`products/${slug}-draft`);
    expect(legacy.kind).toBe('missing');
  });
});

describe('market access', () => {
  it('keeps a UAE-only editor out of Indian URLs', async () => {
    const preview = await previewEdits([{ routeId: (await route(india)).id, action: 'custom', path: '/nope' }], [uae]);
    expect(preview.errors[0]?.message).toMatch(/access/);
    const list = await listRoutes({ q: slug }, [uae]);
    expect(list.rows.every((r) => r.countryId === uae)).toBe(true);
  });
});

describe('patterns', () => {
  it('moves a market’s routes with its pattern, leaves other markets and custom URLs alone', async () => {
    const change = { type: 'PRODUCT' as const, countryId: uae, pattern: '/{slug}' };
    const preview = await previewPattern(change, null);
    expect(preview.items.some((i) => i.newPath === `/ae/${slug}`)).toBe(true);
    await applyPatternChange(change, { token: preview.token, actor: null, allowed: null });
    expect((await route(uae)).path).toBe(`/ae/${slug}`);
    expect((await route(india)).path).toBe(`/${slug}`);
    expect(await resolvePublicRequest(`ae/products/${slug}`)).toMatchObject({ kind: 'redirect', destination: `/ae/${slug}` });

    const reset = { type: 'PRODUCT' as const, countryId: uae, pattern: null };
    const back = await previewPattern(reset, null);
    await applyPatternChange(reset, { token: back.token, actor: null, allowed: null });
    expect((await route(uae)).path).toBe(`/ae/products/${slug}`);
  });

  it('refuses a pattern with the wrong shape or a market prefix', async () => {
    await expect(previewPattern({ type: 'PRODUCT', countryId: null, pattern: '/{slug}/x' }, null)).rejects.toThrow();
    await expect(previewPattern({ type: 'PRODUCT', countryId: null, pattern: '/ae/{slug}' }, null)).rejects.toThrow(/market prefix/);
    await expect(previewPattern({ type: 'BLOG_POST', countryId: uae, pattern: '/{slug}' }, null)).rejects.toThrow(/root/);
  });
});

describe('CSV import', () => {
  it('validates every row: changes, unchanged, duplicates, invalid paths and unknown ids', async () => {
    const indiaRoute = await route(india);
    const uaeRoute = await route(uae);
    const csv = [
      'route_id,target_path',
      `${indiaRoute.id},${indiaRoute.path}`,
      `${uaeRoute.id},/ae/csv-${suffix}`,
      `${uaeRoute.id},/ae/csv-${suffix}`,
      `${indiaRoute.id},/bad path`,
      `missing-${suffix},/x`,
      `${uaeRoute.id},/no-prefix`,
    ].join('\n');
    const { rows, edits } = await importCsv(csv, null);
    expect(rows.map((r) => r.status)).toEqual(['unchanged', 'duplicate', 'duplicate', 'invalid', 'not-found', 'invalid']);
    expect(edits).toHaveLength(0);
  });
});
