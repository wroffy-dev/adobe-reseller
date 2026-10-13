import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mockAuth, uniqueSuffix, ensureTestCountry, formData, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createPage, addSection, updateSection, duplicateSection } = await import('@/lib/actions/pages');
const { parseBlockContent } = await import('@/lib/cms/blocks');
const { parseSectionDesign } = await import('@/lib/cms/design');
const { withFreshItemIds } = await import('@/lib/cms/item-id');
const { ManualPricingTableBlock } = await import('@/components/cms/blocks/pricing-blocks');
type Content = import('@/lib/cms/pricing-blocks').ManualPricingTableContent;

/**
 * The Manual Pricing Comparison section through the real page actions: added
 * from the picker, saved with the ordinary section save, reloaded, reordered
 * and duplicated — with no product involved at any point.
 */

const suffix = uniqueSuffix();
let pageId = '';
let sectionId = '';

const load = async (id = sectionId) => {
  const row = await prisma.pageSection.findUniqueOrThrow({ where: { id } });
  return { content: parseBlockContent<Content>('manualPricingTable', row.content), settings: row.settings };
};

const PLANS = [
  {
    name: 'Photoshop for Teams',
    description: 'Powerful image editing with Photoshop and essential business features for teams.',
    ctaLabel: 'Request quote',
    ctaUrl: '/contact',
    features: [{ text: 'Annual plan, billed monthly' }, { text: 'Photoshop on desktop, web and iPad' }],
  },
  {
    name: 'Creative Cloud Standard for Teams',
    description: 'A complete creative toolkit with 20+ apps.',
    badge: 'Most popular',
    highlight: true,
    ctaLabel: 'Request quote',
    ctaUrl: '/contact',
    customButton: true,
    buttonBg: '#E1251B',
    buttonText: '#FFFFFF',
    buttonWidth: 'auto',
    features: [
      { text: 'Annual plan, billed monthly' },
      { text: 'Photoshop plus 20+ creative apps', emphasis: 'bold' },
      { text: '200 monthly generative credits', customStyle: true, color: '#AA0000' },
    ],
  },
  {
    name: 'Creative Cloud Pro for Teams',
    description: 'A professional creative solution.',
    ctaLabel: 'Request quote',
    ctaUrl: 'https://example.com/quote',
    newTab: true,
    features: [{ text: '4,000 monthly generative credits' }],
  },
];

beforeAll(async () => {
  await ensureTestCountry();
  const page = await createPage(formData({ title: `Pricing ${suffix}`, slug: `pricing-${suffix}`, status: 'DRAFT' }));
  if (!page.ok || !page.data) throw new Error('page not created');
  pageId = page.data.id;
});

afterAll(async () => {
  await prisma.pageSection.deleteMany({ where: { pageId } });
  await prisma.urlRoute.deleteMany({ where: { contentId: pageId } });
  await prisma.page.deleteMany({ where: { id: pageId } });
});

describe('Manual Pricing Comparison in the page builder', () => {
  it('is added from Add Section with empty, valid content', async () => {
    const added = await addSection(pageId, 'manualPricingTable');
    expect(added.ok).toBe(true);
    sectionId = added.ok ? added.data!.id : '';
    const { content } = await load();
    expect(content.plans).toEqual([]);
    expect(content.columns).toBe(3);
    expect(content.cardRadius).toBe('12px');
    expect(renderToStaticMarkup(createElement(ManualPricingTableBlock, { content, ctx: blockCtx() }))).toBe('');
  });

  it('saves and reloads hand-written plans, buttons, highlights, rows and columns', async () => {
    const saved = await updateSection(sectionId, {
      content: {
        heading: 'Choose your plan',
        showLayoutOptions: true,
        columns: 3,
        tabletColumns: 2,
        mobileColumns: 1,
        columnGap: '28px',
        featureSpacing: '12px',
        gridMaxWidth: '1200px',
        cardHeight: 'equal',
        plans: PLANS,
      },
    });
    expect(saved.ok).toBe(true);

    const { content } = await load();
    expect(content.plans.map((p) => p.name)).toEqual(PLANS.map((p) => p.name));
    expect(content.plans.map((p) => p.features.length)).toEqual([2, 3, 1]);
    expect(content.plans.map((p) => p.highlight)).toEqual([false, true, false]);
    expect(content.plans[1]).toMatchObject({ badge: 'Most popular', customButton: true, buttonBg: '#E1251B', buttonWidth: 'auto' });
    expect(content.plans[1]!.features[1]!.emphasis).toBe('bold');
    expect(content.plans[1]!.features[2]).toMatchObject({ customStyle: true, color: '#AA0000' });
    expect(content.plans[2]).toMatchObject({ newTab: true, ctaUrl: 'https://example.com/quote' });
    expect(content).toMatchObject({ tabletColumns: 2, mobileColumns: 1, columnGap: '28px', featureSpacing: '12px', gridMaxWidth: '1200px' });
    // Every plan and feature now has its own stable id.
    const ids = content.plans.flatMap((p) => [p.id, ...p.features.map((f) => f.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps ids stable through a reorder and gives a duplicate its own', async () => {
    const before = (await load()).content;
    const reordered = [before.plans[2]!, before.plans[0]!, before.plans[1]!];
    expect((await updateSection(sectionId, { content: { ...before, plans: reordered } })).ok).toBe(true);
    const after = (await load()).content;
    expect(after.plans.map((p) => p.id)).toEqual(reordered.map((p) => p.id));
    expect(after.plans[0]!.name).toBe('Creative Cloud Pro for Teams');

    const copy = withFreshItemIds(after.plans[2]!);
    const withCopy = [...after.plans, { ...copy, name: 'Copy of Standard' }];
    expect((await updateSection(sectionId, { content: { ...after, plans: withCopy } })).ok).toBe(true);
    const duplicated = (await load()).content;
    expect(duplicated.plans).toHaveLength(4);
    expect(duplicated.plans[3]!.features.map((f) => f.text)).toEqual(after.plans[2]!.features.map((f) => f.text));
    const ids = duplicated.plans.flatMap((p) => [p.id, ...p.features.map((f) => f.id)]);
    expect(new Set(ids).size).toBe(ids.length);

    const removed = duplicated.plans.slice(0, 3);
    expect((await updateSection(sectionId, { content: { ...duplicated, plans: removed } })).ok).toBe(true);
    expect((await load()).content.plans).toHaveLength(3);
  });

  it('stores section width and responsive layout on the Design tab', async () => {
    const saved = await updateSection(sectionId, {
      settings: { widthMode: 'custom', maxWidth: '1400px', tablet: { columns: 2 }, mobile: { columns: 1 } },
    });
    expect(saved.ok).toBe(true);
    const design = parseSectionDesign((await load()).settings);
    expect(design.widthMode).toBe('custom');
    expect(design.maxWidth).toBe('1400px');
    expect(design.tablet.columns).toBe(2);
  });

  it('duplicates the section with the plans intact', async () => {
    const copy = await duplicateSection(sectionId);
    expect(copy.ok).toBe(true);
    const original = (await load()).content;
    const duplicate = (await load(copy.ok ? copy.data!.id : '')).content;
    expect(duplicate.plans.map((p) => p.name)).toEqual(original.plans.map((p) => p.name));
  });

  it('renders the saved comparison without touching products', async () => {
    const productFind = vi.spyOn(prisma.product, 'findMany');
    const countryFind = vi.spyOn(prisma.productCountry, 'findMany');
    const productsBefore = await prisma.product.count();
    const { content, settings } = await load();
    const html = renderToStaticMarkup(
      createElement(ManualPricingTableBlock, { content, ctx: blockCtx(parseSectionDesign(settings)) }),
    );
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(html).toContain('Most popular');
    expect(html).toContain('--grid-cols-tablet:2');
    expect(html).toContain('--mpt-col-gap:28px');
    expect(html).toContain('target="_blank"');
    expect(productFind).not.toHaveBeenCalled();
    expect(countryFind).not.toHaveBeenCalled();
    expect(await prisma.product.count()).toBe(productsBefore);
    productFind.mockRestore();
    countryFind.mockRestore();
  });

  it('leaves the product comparison table as it was', async () => {
    const added = await addSection(pageId, 'productTable');
    expect(added.ok).toBe(true);
    const row = await prisma.pageSection.findUniqueOrThrow({ where: { id: added.ok ? added.data!.id : '' } });
    expect(row.content).toMatchObject({ source: 'all', ctaLabel: 'Get a quote' });
  });
});

function blockCtx(design = parseSectionDesign({})) {
  return {
    sectionId: 's',
    country: testCountryContext() as never,
    inverted: false,
    isFirst: false,
    design,
  };
}
