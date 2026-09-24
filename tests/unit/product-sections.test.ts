import { describe, it, expect } from 'vitest';
import {
  BLOCKS,
  blocksForSurface,
  blockAllowedOnSurface,
  parseBlockContent,
} from '@/lib/cms/blocks';
import { PRODUCT_BLOCKS } from '@/lib/cms/product-blocks';
import { synthesiseProductSections } from '@/lib/cms/product-defaults';
import {
  DEFAULT_PRODUCT_SETTINGS,
  parseProductImage,
  parseProductCard,
  parseProductLayout,
  productStyleVars,
} from '@/lib/cms/product-settings';

/**
 * What a product page is allowed to be built from, and what it falls back to.
 *
 * These are the two rules the product builder rests on: a product page offers
 * every page section as well as its own, and a product nobody has arranged
 * still renders a complete page.
 */

describe('product surfaces', () => {
  it('offers every page block on a product page, as well as the product ones', () => {
    const pageBlocks = blocksForSurface('page').map((block) => block.type);
    const detailBlocks = blocksForSurface('productDetail').map((block) => block.type);

    for (const type of pageBlocks) {
      expect(detailBlocks, `product page should offer ${type}`).toContain(type);
    }
    // And the product's own anatomy, which pages do not get.
    expect(detailBlocks).toContain('productHeader');
    expect(detailBlocks).toContain('productMedia');
    expect(pageBlocks).not.toContain('productHeader');
  });

  it('keeps the sidebar to blocks written for it', () => {
    const sidebar = blocksForSurface('productSidebar').map((block) => block.type);
    expect(sidebar).toContain('productPriceBox');
    // A full-width hero in a narrow column is not a layout anyone wants.
    expect(sidebar).not.toContain('hero');
  });

  it('agrees with itself about what may be added where', () => {
    for (const surface of ['productDetail', 'productSidebar'] as const) {
      const offered = new Set(blocksForSurface(surface).map((block) => block.type));
      for (const type of Object.keys(BLOCKS)) {
        expect(blockAllowedOnSurface(type, surface), `${type} on ${surface}`).toBe(
          offered.has(type),
        );
      }
    }
    expect(blockAllowedOnSurface('nonsense', 'productDetail')).toBe(false);
  });

  it('keeps the anatomy blocks singletons, and lets the listing ones repeat', () => {
    // One title, one gallery, one body, one spec table, one price box.
    const once = ['productHeader', 'productMedia', 'productDescription', 'productSpecs', 'productPriceBox'];
    // These pick what they list, so a second one is a different section.
    const repeatable = ['productRelated', 'productFeatures'];

    expect(new Set([...once, ...repeatable])).toEqual(new Set(Object.keys(PRODUCT_BLOCKS)));

    for (const type of once) {
      expect(PRODUCT_BLOCKS[type].singleton, `${type} should be a singleton`).toBe(true);
    }
    for (const type of repeatable) {
      expect(PRODUCT_BLOCKS[type].singleton, `${type} should be repeatable`).toBeFalsy();
    }
  });

  /*
   * What the builder shows has to be what the page renders. A stored row holds
   * only the keys that were written the last time somebody saved it, so the
   * builder parses it through the block schema the way the renderer does —
   * otherwise a switch nobody turned off reads as off, and saving writes that
   * reading back as fact.
   */
  it('fills a partial row in from the schema, so the editor sees what renders', () => {
    const box = parseBlockContent('productPriceBox', {}) as Record<string, unknown>;
    expect(box.showMonthly).toBe(true);
    expect(box.showCta).toBe(true);
    expect(box.showSpecs).toBe(true);

    // A value that was actually chosen survives; only the absent keys default.
    const chosen = parseBlockContent('productPriceBox', { showAnnual: false }) as Record<
      string,
      unknown
    >;
    expect(chosen.showAnnual).toBe(false);
    expect(chosen.showMonthly).toBe(true);
  });

  it('lets the product name be any heading level, and refuses anything else', () => {
    const parse = (raw: unknown) =>
      parseBlockContent('productHeader', raw) as Record<string, unknown>;

    // The page is about the product, so H1 until someone says otherwise.
    expect(parse({}).titleTag).toBe('h1');
    expect(parse({}).titleSize).toBe('');

    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(parse({ titleTag: tag }).titleTag, tag).toBe(tag);
    }
    // Nothing else reaches the renderer, which interpolates the value as a tag.
    for (const attack of ['script', 'H2', '', 'div onclick=x', null, 7]) {
      expect(parse({ titleTag: attack }).titleTag, String(attack)).toBe('h1');
    }
  });

  it('leaves the breadcrumb where it was until a destination is typed', () => {
    const content = parseBlockContent('productHeader', {}) as Record<string, unknown>;

    // Blank means the built-in destination — this market's home page and its
    // pricing page — so a breadcrumb nobody has touched is unchanged.
    expect(content.homeUrl).toBe('');
    expect(content.productsUrl).toBe('');
    expect(content.homeLabel).toBe('Home');
    expect(content.productsLabel).toBe('Products');
    expect(content.showProductsCrumb).toBe(true);
  });

  it('takes a destination for each crumb', () => {
    const content = parseBlockContent('productHeader', {
      homeUrl: '/start',
      productsUrl: 'https://example.com/catalogue',
      showProductsCrumb: false,
    }) as Record<string, unknown>;

    expect(content.homeUrl).toBe('/start');
    expect(content.productsUrl).toBe('https://example.com/catalogue');
    expect(content.showProductsCrumb).toBe(false);
  });

  it('links the category and the brand by default', () => {
    const content = parseBlockContent('productHeader', {}) as Record<string, unknown>;
    expect(content.linkCategory).toBe(true);
    expect(content.linkBrand).toBe(true);
    expect(
      (parseBlockContent('productHeader', { linkBrand: false }) as Record<string, unknown>)
        .linkBrand,
    ).toBe(false);
  });

  it('hides each crumb control behind the toggle it depends on', () => {
    const fields = PRODUCT_BLOCKS.productHeader.fields ?? [];
    const named = (name: string) => fields.find((field) => field.name === name);

    for (const name of ['homeLabel', 'homeUrl', 'showProductsCrumb']) {
      expect(named(name)?.showWhen, name).toEqual({ field: 'showBreadcrumb', equals: [true] });
    }
    for (const name of ['productsLabel', 'productsUrl']) {
      expect(named(name)?.showWhen, name).toEqual({ field: 'showProductsCrumb', equals: [true] });
    }
    expect(named('linkCategory')?.showWhen).toEqual({ field: 'showCategory', equals: [true] });
    expect(named('linkBrand')?.showWhen).toEqual({ field: 'showBrand', equals: [true] });

    // Typed into a URL box, not a free text one — so the editor offers the
    // same picker every other link in the builder uses.
    expect(named('homeUrl')?.kind).toBe('url');
    expect(named('productsUrl')?.kind).toBe('url');
  });

  it('keeps the price box exactly as it was until the form is switched on', () => {
    const parse = (raw: unknown) =>
      parseBlockContent('productPriceBox', raw) as Record<string, unknown>;

    // Off by default: every price box already on a live product is unchanged.
    expect(parse({}).showForm).toBe(false);
    // Blank means the product's own enquiry form — the one the button opens —
    // so switching it on is usually the only decision to make.
    expect(parse({}).formSlug).toBe('');
    expect(parse({}).formPosition).toBe('below');
    expect(parse({}).formHeading).toBe('');
  });

  it('takes a chosen form and a position, and refuses anything else', () => {
    const parse = (raw: unknown) =>
      parseBlockContent('productPriceBox', raw) as Record<string, unknown>;

    expect(parse({ showForm: true, formSlug: 'enquiry' }).formSlug).toBe('enquiry');
    expect(parse({ formPosition: 'above' }).formPosition).toBe('above');
    // A corrupt position still renders the box rather than throwing.
    for (const attack of ['sideways', '', null, 7, true]) {
      expect(parse({ formPosition: attack }).formPosition, String(attack)).toBe('below');
    }
  });

  it('offers the price box controls in its editor, gated on the toggle', () => {
    const fields = PRODUCT_BLOCKS.productPriceBox.fields ?? [];
    const named = (name: string) => fields.find((field) => field.name === name);

    expect(named('showForm')?.kind).toBe('boolean');
    // Picked from the forms that exist, never typed by hand.
    expect(named('formSlug')?.kind).toBe('form');

    // The two that only make sense once the form is on stay out of the way.
    for (const name of ['formSlug', 'formPosition']) {
      expect(named(name)?.showWhen, name).toEqual({ field: 'showForm', equals: [true] });
    }
    expect(named('showForm')?.showWhen).toBeUndefined();

    // The form's heading moved to the Form tab, with the rest of its look.
    expect(named('formHeading')).toBeUndefined();
    const formTab = (PRODUCT_BLOCKS.productPriceBox.formFields ?? []).flatMap((group) =>
      group.fields.map((field) => field.name),
    );
    expect(formTab).toContain('formHeading');
  });

  it('parses each product block to usable defaults', () => {
    for (const type of Object.keys(PRODUCT_BLOCKS)) {
      const content = parseBlockContent(type, {}) as Record<string, unknown>;
      expect(content, type).toBeTypeOf('object');
    }
    // A corrupt payload still renders rather than throwing.
    const media = parseBlockContent('productMedia', {
      showMainImage: 'nonsense',
      galleryColumns: 99,
    }) as Record<string, unknown>;
    expect(typeof media.showMainImage).toBe('boolean');
    expect(media.galleryColumns).toBe(3);
  });
});

describe('the built-in arrangement', () => {
  it('renders a complete page for a product nobody has arranged', () => {
    const detail = synthesiseProductSections('DETAIL').map((section) => section.blockType);
    expect(detail).toEqual([
      'productHeader',
      'productMedia',
      'productDescription',
      'productFeatures',
      'productRelated',
    ]);

    const sidebar = synthesiseProductSections('SIDEBAR').map((section) => section.blockType);
    expect(sidebar).toEqual(['productPriceBox']);
  });

  it('opens with the product mark beside its name, at the size the design asks for', () => {
    const [header, media] = synthesiseProductSections('DETAIL');
    const headerContent = header.content as Record<string, unknown>;

    // Whether a product follows the built-in arrangement or has its own saved
    // sections, the pairing is the block's default rather than something the
    // seed switches on — so both render it.
    const blockDefault = parseBlockContent('productHeader', {}) as Record<string, unknown>;
    expect(blockDefault.showImage).toBe(true);
    expect((parseBlockContent('productMedia', {}) as Record<string, unknown>).showMainImage).toBe(
      false,
    );

    expect(headerContent.showImage).toBe(true);
    expect(headerContent.imagePosition).toBe('left');
    expect(headerContent.imageWidth).toBe('250px');
    expect(headerContent.imageRatio).toBe('1/1');
    // A logo cropped to fill a square is a damaged logo.
    expect(headerContent.imageFit).toBe('contain');

    // …and the images section below it does not repeat that same image.
    expect((media.content as Record<string, unknown>).showMainImage).toBe(false);
  });

  it('gives every fallback section a stable id, order and parsed content', () => {
    const sections = synthesiseProductSections('DETAIL');
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
    expect(sections.map((s) => s.sortOrder)).toEqual([10, 20, 30, 40, 50]);
    for (const section of sections) {
      expect(section.isVisible).toBe(true);
      expect(section.content).toBeTypeOf('object');
    }
    // Synthesised twice, identical — nothing about it is time or random.
    expect(synthesiseProductSections('DETAIL')).toEqual(sections);
  });
});

describe('product design settings', () => {
  it('writes no colour or size variable until one is set', () => {
    const vars = productStyleVars(DEFAULT_PRODUCT_SETTINGS);
    // Only the values that always have a meaning are emitted; an untouched
    // site must not have its card repainted by a variable it never set.
    expect(vars['--product-card-bg']).toBeUndefined();
    expect(vars['--product-card-image-width']).toBeUndefined();
    expect(vars['--product-title-size']).toBeUndefined();
    expect(vars['--product-card-shadow']).toBe('0 1px 2px rgb(0 0 0 / 0.05)');
  });

  it('turns image sizes into variables the card and the page read', () => {
    const image = parseProductImage({
      cardWidth: '120px',
      cardRatio: '1/1',
      cardFit: 'contain',
      mainMaxWidth: '640px',
      galleryColumns: 4,
    });
    const vars = productStyleVars({ ...DEFAULT_PRODUCT_SETTINGS, image });

    expect(vars['--product-card-image-width']).toBe('120px');
    expect(vars['--product-card-image-ratio']).toBe('1 / 1');
    expect(vars['--product-card-image-fit']).toBe('contain');
    expect(vars['--product-main-image-width']).toBe('640px');
    expect(vars['--product-gallery-columns']).toBe('4');
  });

  it('falls back to the defaults rather than throwing on a corrupt record', () => {
    expect(parseProductCard('not an object')).toEqual(DEFAULT_PRODUCT_SETTINGS.card);
    expect(parseProductImage(null)).toEqual(DEFAULT_PRODUCT_SETTINGS.image);
    // A phone reads the page in the order it was written, with the price box
    // at the end rather than in front of what the product is.
    expect(parseProductLayout({ sidebarWidth: 42, mobileSidebar: 'sideways' })).toMatchObject({
      mobileSidebar: 'below',
    });
    expect(parseProductLayout({}).mobileSidebar).toBe('below');
    // …and a site that chose "above" keeps it.
    expect(parseProductLayout({ mobileSidebar: 'above' }).mobileSidebar).toBe('above');
  });

  it('keeps a hex colour and drops anything that is not one', () => {
    expect(parseProductLayout({ priceColor: '#0061ff' }).priceColor).toBe('#0061FF');
    expect(parseProductLayout({ priceColor: 'red' }).priceColor).toBe('');
  });
});
