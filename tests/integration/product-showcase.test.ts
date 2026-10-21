import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { mockAuth, uniqueSuffix, ensureTestCountry, formData, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createPage, addSection, updateSection } = await import('@/lib/actions/pages');
const { listProductsForImport } = await import('@/lib/actions/pickers');
const { parseBlockContent } = await import('@/lib/cms/blocks');
const { parseSectionDesign } = await import('@/lib/cms/design');
const { ProductShowcaseBlock } = await import('@/components/cms/blocks/showcase-blocks');
type Content = import('@/lib/cms/showcase-blocks').ProductShowcaseContent;

/**
 * The Product Showcase section through the real page actions: added from the
 * picker, filled from the catalogue, edited, saved, reloaded and rendered —
 * following the products it names in this market.
 */

const suffix = uniqueSuffix();
let pageId = '';
let sectionId = '';
let mediaId = '';
const productIds: Record<'photoshop' | 'acrobat' | 'draft', string> = { photoshop: '', acrobat: '', draft: '' };

const load = async () => {
  const row = await prisma.pageSection.findUniqueOrThrow({ where: { id: sectionId } });
  return parseBlockContent<Content>('productShowcase', row.content);
};

const render = async (content: Content) =>
  renderToStaticMarkup(
    (await ProductShowcaseBlock({
      content,
      ctx: { sectionId: 's', country: testCountryContext() as never, inverted: false, isFirst: false, design: parseSectionDesign({}) },
    })) ?? null,
  );

async function product(key: keyof typeof productIds, name: string, status: 'PUBLISHED' | 'DRAFT', imageId?: string) {
  const row = await prisma.product.create({
    data: {
      name,
      slug: `${key}-${suffix}`,
      status: 'PUBLISHED',
      currency: 'INR',
      features: [],
      benefits: [],
      specs: [],
      galleryIds: [],
      ...(imageId ? { imageId } : {}),
    },
  });
  await prisma.productCountry.create({
    data: { productId: row.id, countryId: 'country_in', status, publishedAt: status === 'PUBLISHED' ? new Date() : null },
  });
  productIds[key] = row.id;
}

beforeAll(async () => {
  await ensureTestCountry();
  const media = await prisma.media.create({
    data: {
      filename: `ps-${suffix}.png`,
      storageKey: `test/ps-${suffix}.png`,
      url: `/uploads/ps-${suffix}.png`,
      mimeType: 'image/png',
      size: 100,
    },
  });
  mediaId = media.id;
  await product('photoshop', `Photoshop ${suffix}`, 'PUBLISHED', mediaId);
  await product('acrobat', `Acrobat ${suffix}`, 'PUBLISHED');
  await product('draft', `Draft ${suffix}`, 'DRAFT');
  const page = await createPage(formData({ title: `Showcase ${suffix}`, slug: `showcase-${suffix}`, status: 'DRAFT' }));
  if (!page.ok || !page.data) throw new Error('page not created');
  pageId = page.data.id;
});

afterAll(async () => {
  await prisma.pageSection.deleteMany({ where: { pageId } });
  await prisma.urlRoute.deleteMany({ where: { contentId: pageId } });
  await prisma.page.deleteMany({ where: { id: pageId } });
  await prisma.product.deleteMany({ where: { id: { in: Object.values(productIds).filter(Boolean) } } });
  await prisma.media.deleteMany({ where: { id: mediaId } });
});

describe('Product Showcase in the page builder', () => {
  it('is added from Add Section with an empty grid', async () => {
    const added = await addSection(pageId, 'productShowcase');
    if (!added.ok || !added.data) throw new Error('section not added');
    sectionId = added.data.id;
    const content = await load();
    expect(content.items).toEqual([]);
    expect(await render(content)).toBe('');
  });

  it('"Add all products" lists this market’s catalogue', async () => {
    const rows = await listProductsForImport();
    const names = rows.map((r) => r.name);
    expect(names).toContain(`Photoshop ${suffix}`);
    expect(names).toContain(`Acrobat ${suffix}`);
    expect(rows.find((r) => r.name === `Photoshop ${suffix}`)?.productId).toBe(productIds.photoshop);
  });

  it('saves edited tiles and renders them linked, renamed and with images', async () => {
    const saved = await updateSection(sectionId, {
      content: {
        heading: 'Who we serve',
        style: 'card',
        columns: 4,
        cardBorderColor: '#E2E8F0',
        items: [
          { productId: productIds.photoshop, name: '' },
          { productId: productIds.acrobat, name: 'Acrobat for Teams', badge: 'New', description: 'PDFs, signed.' },
          { productId: productIds.draft, name: 'Not on sale' },
          { name: 'Schools' },
          { name: 'CA Firms', url: '/industries/ca-firms' },
          { name: 'Hidden', visible: false },
        ],
      },
    });
    expect(saved.ok).toBe(true);

    const content = await load();
    expect(content.items).toHaveLength(6);
    expect(content).toMatchObject({ style: 'card', columns: 4, cardBorderColor: '#E2E8F0' });

    const html = await render(content);
    expect(html).toContain('Who we serve');
    expect(html).toContain(`Photoshop ${suffix}`);
    expect(html).toContain(`href="/products/photoshop-${suffix}"`);
    expect(html).toContain(encodeURIComponent(`/uploads/ps-${suffix}.png`));
    expect(html).toContain('Acrobat for Teams');
    expect(html).toContain('New');
    expect(html).toContain('PDFs, signed.');
    expect(html).toContain('Schools');
    expect(html).toContain('href="/industries/ca-firms"');
    expect(html).not.toContain('Not on sale');
    expect(html).not.toContain('Hidden');
    expect(html.match(/class="psc-item"/g)).toHaveLength(4);
    expect(html).toContain('psc--card');
    expect(html).toContain('--grid-cols:4');
  });

  it('turns images off for the whole grid', async () => {
    const html = await render({ ...(await load()), showImages: false });
    expect(html).not.toContain('<img');
  });
});
