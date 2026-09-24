import { z } from 'zod';
import { normaliseColor } from './color';
import { normaliseLength } from './design';
import { SHADOWS, SHADOW_CSS, IMAGE_RATIOS, RATIO_CSS } from './blog-settings';

/**
 * Product-wide presentation settings.
 *
 * These describe the parts of a product's presentation that are *not* a
 * section: how a product card looks everywhere one appears, how big its images
 * are, how the detail page and its sidebar share the width, and the product
 * pages' own typography overrides. They live in `ProductSettings`'s JSON
 * columns and are parsed through the schemas below, which never throw — an
 * unknown or half-written value falls back to the default, so a bad save can
 * never take the catalogue down.
 *
 * Everything here is an *override*: an empty string means "inherit", either
 * from the website's global design settings or from the component's own
 * sensible default. That is what keeps products looking like the rest of the
 * site until an administrator deliberately changes something — and it is why
 * adding this screen changed nothing about any existing page.
 *
 * The shadow and ratio vocabularies are imported rather than redeclared: an
 * admin who learns them on the blog design screen already knows them here, and
 * two lists that mean the same thing are one list too many.
 */

export { SHADOWS, SHADOW_CSS, IMAGE_RATIOS, RATIO_CSS };
export type { ShadowSize } from './blog-settings';

const length = z.preprocess(normaliseLength, z.string());

const hex = z
  .string()
  .trim()
  .transform((v) => normaliseColor(v))
  .catch('')
  .default('');

const bool = (fallback: boolean) => z.coerce.boolean().catch(fallback).default(fallback);

const shadow = z.enum(SHADOWS).catch('sm').default('sm');
const ratio = z.enum(IMAGE_RATIOS).catch('auto').default('auto');
const fit = z.enum(['cover', 'contain', 'fill', 'none']).catch('cover').default('cover');

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

/**
 * One definition of a product card, used by the product grid, the cards block,
 * the slider and the "Other plans" rail.
 *
 * Only appearance lives here. What a card *shows* stays on the section that
 * placed it, because two grids on one page routinely differ in that — a
 * pricing table wants features, a "you may also like" rail does not.
 */
export const productCardSchema = z.object({
  // --- frame ---
  background: hex,
  borderEnabled: bool(true),
  borderWidth: length.default(''),
  borderColor: hex,
  radius: length.default(''),
  padding: length.default(''),
  shadow,
  align: z.enum(['left', 'center']).catch('left').default('left'),

  // --- type ---
  titleSize: length.default(''),
  titleWeight: z.enum(['400', '500', '600', '700', '800']).catch('700').default('700'),
  titleColor: hex,
  descriptionColor: hex,
  priceSize: length.default(''),
  priceColor: hex,
  featureColor: hex,
  /** The tick beside a feature, and the icon beside a benefit. */
  iconColor: hex,

  // --- grid ---
  gridGap: length.default(''),
  rowGap: length.default(''),
});

export type ProductCardSettings = z.infer<typeof productCardSchema>;
export const DEFAULT_PRODUCT_CARD: ProductCardSettings = productCardSchema.parse({});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Image sizes, in three places that are genuinely different jobs: the small
 * mark on a card, the main image on the product page, and the gallery beneath it.
 *
 * Sizes are CSS lengths rather than pixel numbers so `120px`, `8rem` and `100%`
 * are all sayable. A blank value keeps the size the component already used,
 * which is why every existing page is unchanged until one is set.
 */
export const productImageSchema = z.object({
  // --- on a card ---
  cardWidth: length.default(''),
  cardHeight: length.default(''),
  cardRatio: ratio,
  cardFit: fit,
  cardRadius: length.default(''),
  /** Off hides the card image everywhere, whatever a section says. */
  cardFullWidth: bool(false),

  // --- the product page's main image ---
  mainMaxWidth: length.default(''),
  mainRatio: ratio,
  mainFit: fit,
  mainRadius: length.default(''),

  // --- the gallery under it ---
  galleryColumns: z.coerce.number().int().min(1).max(6).catch(3).default(3),
  galleryHeight: length.default(''),
  galleryRatio: ratio,
  galleryFit: fit,
  galleryRadius: length.default(''),
  galleryGap: length.default(''),
});

export type ProductImageSettings = z.infer<typeof productImageSchema>;
export const DEFAULT_PRODUCT_IMAGE: ProductImageSettings = productImageSchema.parse({});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTHS = ['25%', '30%', '35%', '40%'] as const;

/**
 * Quick choices for the product page's container width.
 *
 * Blank inherits the website's own container, like every other blank here.
 * "Wide" is the header's default width, so a product page set to it lines its
 * content up with the logo and the menu. Anything else is a custom length.
 */
export const CONTAINER_WIDTH_PRESETS = [
  { value: '', label: 'Website default' },
  { value: '48rem', label: 'Narrow — 768px' },
  { value: '80rem', label: 'Wide — 1280px, lines up with the header' },
  { value: '100%', label: 'Full width' },
] as const;
export const MOBILE_SIDEBAR = ['below', 'above', 'hidden'] as const;

export const productLayoutSchema = z.object({
  containerWidth: length.default(''),
  sectionGap: length.default(''),

  // --- the two columns ---
  sidebarEnabled: bool(true),
  sidebarPosition: z.enum(['right', 'left']).catch('right').default('right'),
  /** Any CSS length; the admin picker offers 25/30/35/40% as shortcuts. */
  sidebarWidth: length.default('33%'),
  sidebarGap: length.default(''),
  sidebarSticky: bool(true),
  stickyOffset: length.default('96px'),
  /**
   * Where the price box goes on a phone.
   *
   * Below the content. Above it, the sidebar is the first thing on the page:
   * a visitor arriving from a search result meets a price box before they have
   * seen what the product is, and everything they came to read is a scroll
   * away. Below, the page reads in the order it was written and the price box
   * closes it.
   */
  mobileSidebar: z.enum(MOBILE_SIDEBAR).catch('below').default('below'),

  /*
   * The rail of related products is not here. It is the `productRelated`
   * block on each product's own layout, which carries its heading, its
   * source, how many it lists and how many across — including per screen
   * size. A catalogue-wide copy of those would be shadowed by every product's
   * stored row, so it could only ever look broken.
   */

  // --- colours (blank inherits the website palette) ---
  backgroundColor: hex,
  headingColor: hex,
  textColor: hex,
  linkColor: hex,
  priceColor: hex,
});

export type ProductLayoutSettings = z.infer<typeof productLayoutSchema>;
export const DEFAULT_PRODUCT_LAYOUT: ProductLayoutSettings = productLayoutSchema.parse({});

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/** One type role. Every value is an override — blank inherits the global font. */
const typeRoleSchema = z.object({
  size: length.default(''),
  weight: z.enum(['', '300', '400', '500', '600', '700', '800', '900']).catch('').default(''),
  lineHeight: z.string().max(8).catch('').default(''),
  letterSpacing: z.string().max(12).catch('').default(''),
});

export type TypeRole = z.infer<typeof typeRoleSchema>;

export const PRODUCT_TYPE_ROLES = [
  'productTitle',
  'price',
  'h2',
  'h3',
  'body',
  'meta',
  'cardTitle',
  'sidebarHeading',
] as const;

export type ProductTypeRole = (typeof PRODUCT_TYPE_ROLES)[number];

export const PRODUCT_TYPE_ROLE_LABELS: Record<ProductTypeRole, string> = {
  productTitle: 'Product title',
  price: 'Price',
  h2: 'Section heading (H2)',
  h3: 'Sub-heading (H3)',
  body: 'Description body',
  meta: 'Meta text',
  cardTitle: 'Product card title',
  sidebarHeading: 'Sidebar heading',
};

/** CSS custom property each role writes. Read by the product stylesheet rules. */
const PRODUCT_TYPE_ROLE_VARS: Record<ProductTypeRole, string> = {
  productTitle: '--product-title',
  price: '--product-price',
  h2: '--product-h2',
  h3: '--product-h3',
  body: '--product-body',
  meta: '--product-meta',
  cardTitle: '--product-card-title',
  sidebarHeading: '--product-sidebar-heading',
};

export const productTypographySchema = z.object(
  Object.fromEntries(
    PRODUCT_TYPE_ROLES.map((role) => [role, typeRoleSchema.default(typeRoleSchema.parse({}))]),
  ) as { [K in ProductTypeRole]: z.ZodDefault<typeof typeRoleSchema> },
);

export type ProductTypography = z.infer<typeof productTypographySchema>;
export const DEFAULT_PRODUCT_TYPOGRAPHY: ProductTypography = productTypographySchema.parse({});

/** Turns the typography overrides into CSS variables for the product wrapper. */
export function productTypographyVars(typography: ProductTypography): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of PRODUCT_TYPE_ROLES) {
    const value = typography[role];
    const base = PRODUCT_TYPE_ROLE_VARS[role];
    if (value.size) vars[`${base}-size`] = value.size;
    if (value.weight) vars[`${base}-weight`] = value.weight;
    if (value.lineHeight) vars[`${base}-lh`] = value.lineHeight;
    if (value.letterSpacing) vars[`${base}-ls`] = value.letterSpacing;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function safeParse<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
}

export const parseProductCard = (raw: unknown) =>
  safeParse(productCardSchema, raw, DEFAULT_PRODUCT_CARD);
export const parseProductImage = (raw: unknown) =>
  safeParse(productImageSchema, raw, DEFAULT_PRODUCT_IMAGE);
export const parseProductLayout = (raw: unknown) =>
  safeParse(productLayoutSchema, raw, DEFAULT_PRODUCT_LAYOUT);
export const parseProductTypography = (raw: unknown) =>
  safeParse(productTypographySchema, raw, DEFAULT_PRODUCT_TYPOGRAPHY);

export type ResolvedProductSettings = {
  card: ProductCardSettings;
  image: ProductImageSettings;
  layout: ProductLayoutSettings;
  typography: ProductTypography;
};

export const DEFAULT_PRODUCT_SETTINGS: ResolvedProductSettings = {
  card: DEFAULT_PRODUCT_CARD,
  image: DEFAULT_PRODUCT_IMAGE,
  layout: DEFAULT_PRODUCT_LAYOUT,
  typography: DEFAULT_PRODUCT_TYPOGRAPHY,
};

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/** CSS custom properties one product card settings record contributes. */
export function productCardVars(card: ProductCardSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  if (card.background) vars['--product-card-bg'] = card.background;
  if (card.borderEnabled) {
    vars['--product-card-border-width'] = card.borderWidth || '1px';
    vars['--product-card-border-color'] = card.borderColor || 'rgb(var(--brand-border))';
  } else {
    vars['--product-card-border-width'] = '0px';
  }
  if (card.radius) vars['--product-card-radius'] = card.radius;
  if (card.padding) vars['--product-card-padding'] = card.padding;
  vars['--product-card-shadow'] = SHADOW_CSS[card.shadow];
  vars['--product-card-align'] = card.align;
  if (card.titleSize) vars['--product-card-title-size'] = card.titleSize;
  vars['--product-card-title-weight'] = card.titleWeight;
  if (card.titleColor) vars['--product-card-title-color'] = card.titleColor;
  if (card.descriptionColor) vars['--product-card-description-color'] = card.descriptionColor;
  if (card.priceSize) vars['--product-card-price-size'] = card.priceSize;
  if (card.priceColor) vars['--product-card-price-color'] = card.priceColor;
  if (card.featureColor) vars['--product-card-feature-color'] = card.featureColor;
  if (card.iconColor) vars['--product-card-icon-color'] = card.iconColor;
  if (card.gridGap) vars['--product-grid-gap'] = card.gridGap;
  if (card.rowGap) vars['--product-grid-row-gap'] = card.rowGap;
  return vars;
}

/** CSS custom properties for image sizes, in all three places. */
export function productImageVars(image: ProductImageSettings): Record<string, string> {
  const vars: Record<string, string> = {};

  if (image.cardWidth) vars['--product-card-image-width'] = image.cardWidth;
  if (image.cardHeight) vars['--product-card-image-height'] = image.cardHeight;
  const cardRatio = RATIO_CSS[image.cardRatio];
  if (cardRatio) vars['--product-card-image-ratio'] = cardRatio;
  vars['--product-card-image-fit'] = image.cardFit;
  if (image.cardRadius) vars['--product-card-image-radius'] = image.cardRadius;

  if (image.mainMaxWidth) vars['--product-main-image-width'] = image.mainMaxWidth;
  const mainRatio = RATIO_CSS[image.mainRatio];
  if (mainRatio) vars['--product-main-image-ratio'] = mainRatio;
  vars['--product-main-image-fit'] = image.mainFit;
  if (image.mainRadius) vars['--product-main-image-radius'] = image.mainRadius;

  vars['--product-gallery-columns'] = String(image.galleryColumns);
  if (image.galleryHeight) vars['--product-gallery-height'] = image.galleryHeight;
  const galleryRatio = RATIO_CSS[image.galleryRatio];
  if (galleryRatio) vars['--product-gallery-ratio'] = galleryRatio;
  vars['--product-gallery-fit'] = image.galleryFit;
  if (image.galleryRadius) vars['--product-gallery-radius'] = image.galleryRadius;
  if (image.galleryGap) vars['--product-gallery-gap'] = image.galleryGap;

  return vars;
}

/** CSS custom properties for the page's own frame and palette overrides. */
export function productLayoutVars(layout: ProductLayoutSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  if (layout.containerWidth) vars['--product-container'] = layout.containerWidth;
  if (layout.sectionGap) vars['--product-section-gap'] = layout.sectionGap;
  vars['--product-sidebar-width'] = layout.sidebarWidth || '33%';
  if (layout.sidebarGap) vars['--product-sidebar-gap'] = layout.sidebarGap;
  if (layout.sidebarSticky) vars['--product-sticky-offset'] = layout.stickyOffset || '96px';
  if (layout.backgroundColor) vars['--product-bg'] = layout.backgroundColor;
  if (layout.headingColor) vars['--product-heading-color'] = layout.headingColor;
  if (layout.textColor) vars['--product-text-color'] = layout.textColor;
  if (layout.linkColor) vars['--product-link-color'] = layout.linkColor;
  if (layout.priceColor) vars['--product-price-color'] = layout.priceColor;
  return vars;
}

/** Everything the product wrapper needs, in one style object. */
export function productStyleVars(settings: ResolvedProductSettings): Record<string, string> {
  return {
    ...productCardVars(settings.card),
    ...productImageVars(settings.image),
    ...productLayoutVars(settings.layout),
    ...productTypographyVars(settings.typography),
  };
}
