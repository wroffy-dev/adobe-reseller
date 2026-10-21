import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLOCK_PICKER_LIST, blockDefaults, getBlock, parseBlockContent, blocksForSurface } from '@/lib/cms/blocks';
import { MAX_SHOWCASE_ITEMS, productShowcaseSchema, type ProductShowcaseContent } from '@/lib/cms/showcase-blocks';
import {
  resolveShowcaseTile,
  resolveShowcaseTiles,
  showcaseLookups,
  type ShowcaseMedia,
  type ShowcaseProduct,
} from '@/lib/cms/showcase-resolve';
import type { FieldDescriptor } from '@/lib/cms/fields';

const parse = (raw: unknown) => parseBlockContent<ProductShowcaseContent>('productShowcase', raw);

const PRODUCTS = new Map<string, ShowcaseProduct>([
  ['p1', { name: 'Photoshop', href: '/products/photoshop', imageUrl: '/uploads/ps.png', imageAlt: 'Photoshop logo' }],
  ['p2', { name: 'Acrobat Pro', href: '/products/acrobat-pro', imageUrl: null, imageAlt: null }],
]);
const MEDIA = new Map<string, ShowcaseMedia>([['m1', { url: '/uploads/custom.png', altText: 'Custom', width: 200, height: 100 }]]);

describe('Product Showcase — registry', () => {
  it('is offered in the page picker and on product pages', () => {
    expect(getBlock('productShowcase')?.label).toBe('Product Showcase');
    expect(BLOCK_PICKER_LIST.some((b) => b.type === 'productShowcase')).toBe(true);
    expect(blocksForSurface('productDetail').some((b) => b.type === 'productShowcase')).toBe(true);
  });

  it('has defaults that parse to an empty grid in the tile style', () => {
    const defaults = blockDefaults('productShowcase') as ProductShowcaseContent;
    expect(defaults.items).toEqual([]);
    expect(defaults.style).toBe('tile');
    expect(defaults.columns).toBe(5);
    expect(defaults.showImages).toBe(true);
  });

  it('offers "Add all products" on the tiles list, and a single product picker per tile', () => {
    const fields = getBlock('productShowcase')!.fields;
    const tiles = fields.find((f) => f.name === 'items') as Extract<FieldDescriptor, { kind: 'repeater' }>;
    expect(tiles.kind).toBe('repeater');
    expect(tiles.importer).toBe('products');
    expect(tiles.identity).toBe(true);
    expect(tiles.max).toBe(MAX_SHOWCASE_ITEMS);
    expect(tiles.fields.find((f) => f.name === 'productId')?.kind).toBe('product');
  });

  it('every field the editor writes is one the schema keeps', () => {
    const keys = Object.keys(productShowcaseSchema.shape);
    for (const field of getBlock('productShowcase')!.fields) expect(keys).toContain(field.name);
  });

  it('renders through the section renderer', () => {
    const source = readFileSync('src/components/cms/section-renderer.tsx', 'utf8');
    expect(source).toContain("case 'productShowcase'");
  });
});

describe('Product Showcase — content', () => {
  it('keeps what an administrator typed, and drops what is unsafe', () => {
    const content = parse({
      heading: 'Who we serve',
      style: 'chip',
      columns: 4,
      items: [
        { name: 'Startups', url: '/industries/startups', description: 'Move fast.' },
        { name: 'Bad link', url: 'javascript:alert(1)' },
      ],
    });
    expect(content.style).toBe('chip');
    expect(content.items).toHaveLength(2);
    expect(content.items[0]!.url).toBe('/industries/startups');
    expect(content.items[1]!.url).toBe('');
    expect(content.items[0]!.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(content.items[0]!.id).not.toBe(content.items[1]!.id);
  });

  it('falls back to defaults rather than failing on a bad value', () => {
    const content = parse({ style: 'carousel', columns: 40, imageShape: 'hexagon', items: 'nope' });
    expect(content.style).toBe('tile');
    expect(content.columns).toBe(5);
    expect(content.imageShape).toBe('rounded');
    expect(content.items).toEqual([]);
  });

  it('holds at most the limit of tiles', () => {
    const items = Array.from({ length: MAX_SHOWCASE_ITEMS + 5 }, (_, i) => ({ name: `T${i}` }));
    expect(parse({ items }).items).toEqual([]);
    expect(parse({ items: items.slice(0, MAX_SHOWCASE_ITEMS) }).items).toHaveLength(MAX_SHOWCASE_ITEMS);
  });

  it('gives duplicated ids fresh ones', () => {
    const content = parse({ items: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] });
    expect(new Set(content.items.map((i) => i.id)).size).toBe(2);
  });
});

describe('Product Showcase — tiles', () => {
  const content = (items: unknown[], extra: Record<string, unknown> = {}) => parse({ items, ...extra });

  it('a tile tied to a product follows its name, page and image', () => {
    const [tile] = resolveShowcaseTiles(content([{ productId: 'p1' }]), PRODUCTS, MEDIA);
    expect(tile).toMatchObject({ name: 'Photoshop', href: '/products/photoshop' });
    expect(tile!.image).toMatchObject({ url: '/uploads/ps.png', alt: 'Photoshop logo' });
  });

  it('a typed name, a chosen image and a link of its own all win over the product', () => {
    const [tile] = resolveShowcaseTiles(
      content([{ productId: 'p1', name: 'Photoshop for Teams', imageId: 'm1', url: '/contact' }]),
      PRODUCTS,
      MEDIA,
    );
    expect(tile).toMatchObject({ name: 'Photoshop for Teams', href: '/contact' });
    expect(tile!.image).toMatchObject({ url: '/uploads/custom.png', width: 200, height: 100 });
  });

  it('a tile written by hand needs only a name, and links nowhere without a link', () => {
    const tiles = resolveShowcaseTiles(content([{ name: 'Schools' }, { name: 'NGOs', url: '/ngos' }]), PRODUCTS, MEDIA);
    expect(tiles.map((t) => [t.name, t.href])).toEqual([
      ['Schools', ''],
      ['NGOs', '/ngos'],
    ]);
    expect(tiles[0]!.image).toBeNull();
  });

  it('leaves out hidden tiles, nameless tiles and products this market does not sell', () => {
    const tiles = resolveShowcaseTiles(
      content([
        { name: 'Hidden', visible: false },
        { name: '   ' },
        { productId: 'not-sold-here' },
        { productId: 'not-sold-here', name: 'Still linked', url: '/elsewhere' },
      ]),
      PRODUCTS,
      MEDIA,
    );
    expect(tiles.map((t) => t.name)).toEqual(['Still linked']);
  });

  it('shows no images when images are off, or on a tile that hides its own', () => {
    const off = resolveShowcaseTiles(content([{ productId: 'p1' }], { showImages: false }), PRODUCTS, MEDIA);
    expect(off[0]!.image).toBeNull();
    const hidden = resolveShowcaseTiles(content([{ productId: 'p1', hideImage: true }]), PRODUCTS, MEDIA);
    expect(hidden[0]!.image).toBeNull();
    const none = resolveShowcaseTiles(content([{ productId: 'p2' }]), PRODUCTS, MEDIA);
    expect(none[0]!.image).toBeNull();
  });

  it('shows paragraphs only when they are switched on', () => {
    const on = resolveShowcaseTile(parse({ items: [{ name: 'A', description: ' Hello ' }] }).items[0]!, { showImages: true, showDescriptions: true }, PRODUCTS, MEDIA);
    const off = resolveShowcaseTile(parse({ items: [{ name: 'A', description: 'Hello' }] }).items[0]!, { showImages: true, showDescriptions: false }, PRODUCTS, MEDIA);
    expect(on!.description).toBe('Hello');
    expect(off!.description).toBe('');
  });

  it('carries a tile’s own style only when it asks for one', () => {
    const tiles = resolveShowcaseTiles(
      content([
        { name: 'A', customStyle: true, background: '#ff0000', borderColor: '#00ff00', textColor: '#0000ff' },
        { name: 'B', background: '#ff0000' },
      ]),
      PRODUCTS,
      MEDIA,
    );
    expect(tiles[0]!.style).toEqual({ background: '#FF0000', borderColor: '#00FF00', textColor: '#0000FF' });
    expect(tiles[1]!.style).toBeNull();
  });

  it('asks only for the products and images visible tiles need', () => {
    const lookups = showcaseLookups(
      content([
        { productId: 'p1', imageId: 'm1' },
        { productId: 'p1' },
        { productId: 'p2', imageId: 'm2', hideImage: true },
        { productId: 'p3', imageId: 'm3', visible: false },
      ]),
    );
    expect(lookups.productIds).toEqual(['p1', 'p2']);
    expect(lookups.mediaIds).toEqual(['m1']);
    expect(showcaseLookups(content([{ imageId: 'm1' }], { showImages: false })).mediaIds).toEqual([]);
  });
});
