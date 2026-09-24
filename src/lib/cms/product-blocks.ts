import { z } from 'zod';
import {
  responsiveColumnsSchema,
  responsiveColumnFields,
  type BlockDefinition,
} from './block-types';
import { formStyleField, formStyleGroups, FORM_PICKER_HELP } from './form-style';

/**
 * Product blocks.
 *
 * The parts a product page is made of — its header, its images, its
 * description, its feature lists, its specification table, the rail of other
 * plans, and the price box in the sidebar. Each is an ordinary CMS block, a
 * Zod schema plus a field list, merged into the same registry pages and the
 * blog use. That is what lets a product page reuse the page builder's editor,
 * design panel, drag-and-drop outline and renderer dispatch instead of growing
 * a third builder beside them.
 *
 * Most are a `singleton`: a product has one title, one gallery, one body and
 * one price, so those can be reordered, hidden and styled but never stacked
 * twice — two <h1>s for one product is not a layout anybody asked for.
 *
 * The exceptions are the two whose fields change *what is listed*, not just
 * how the same thing looks: "Other plans" picks its own source, so a page can
 * carry one rail of the same category and another of the featured plans, and
 * "Features & benefits" can be split into a features section and a benefits
 * section with their own headings and column counts. Anything else an
 * administrator wants twice — a CTA, a FAQ, a testimonial rail — is an
 * ordinary page block, and the product surfaces offer all of those too.
 *
 * Nothing here hardcodes content. Each block reads the product being rendered;
 * the fields decide what of it is shown and what it is called.
 */

const bool = (fallback: boolean) => z.coerce.boolean().catch(fallback).default(fallback);
const heading = (fallback: string) => z.string().max(160).catch(fallback).default(fallback);

// ---------------------------------------------------------------------------
// Detail surface
// ---------------------------------------------------------------------------

const productHeaderSchema = z.object({
  showBreadcrumb: bool(true),

  /*
   * Each crumb before the product is a label and a destination, both editable.
   * A blank destination keeps the built-in one — the market's own home page
   * and its pricing page — so a breadcrumb nobody has touched is unchanged,
   * and a site whose catalogue lives somewhere else can point at it without a
   * code change.
   */
  homeLabel: z.string().max(60).catch('Home').default('Home'),
  homeUrl: z.string().max(500).catch('').default(''),
  showProductsCrumb: bool(true),
  productsLabel: z.string().max(60).catch('Products').default('Products'),
  productsUrl: z.string().max(500).catch('').default(''),

  showCategory: bool(true),
  showBrand: bool(true),
  /*
   * The category and the brand as links to their own pages, which is what a
   * visitor reading "Cloud storage · Dropbox" expects them to be. On by
   * default; a category with no published page renders as plain text either
   * way, so switching this on can never produce a link to a 404.
   */
  linkCategory: bool(true),
  linkBrand: bool(true),
  showSku: bool(false),
  showShortDescription: bool(true),
  align: z.enum(['left', 'center']).catch('left').default('left'),

  /**
   * Which heading element the product name is.
   *
   * `h1` by default, because on a product page the product is what the page is
   * about. It is a choice rather than a fixture because a page that opens with
   * a hero above this one already has its `h1`, and two of them is worse than
   * picking the right level here.
   */
  titleTag: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).catch('h1').default('h1'),
  /** Blank keeps the built-in responsive size, which grows with the screen. */
  titleSize: z.string().max(16).catch('').default(''),

  /**
   * The product's image, beside the name rather than under it.
   *
   * On by default: the opening pair — the product's mark on one side, its
   * category, name and summary on the other — is what a catalogue page is
   * for, and it is the arrangement this one is designed around. The "Product
   * images" section below defaults to the gallery alone for the same reason,
   * so one picture never appears twice.
   *
   * Both are ordinary toggles. A page that wants the image underneath again
   * turns this off and turns the main image back on down there.
   */
  showImage: bool(true),
  imagePosition: z.enum(['left', 'right']).catch('left').default('left'),
  /** The side the image occupies. Square by default, so 250px is 250 × 250. */
  imageWidth: z.string().max(16).catch('250px').default('250px'),
  imageRatio: z.enum(['1/1', '4/3', '3/2', '16/9', 'auto']).catch('1/1').default('1/1'),
  /**
   * `contain` by default: a product mark is usually a logo, and cropping a
   * logo to fill a square is how a brand ends up with its corners cut off.
   */
  imageFit: z.enum(['cover', 'contain', 'fill', 'none']).catch('contain').default('contain'),
  imageBorder: bool(true),
});

const productMediaSchema = z.object({
  /**
   * Off by default, because the header carries the main image. Left on
   * alongside it, the same picture renders twice, once under the other.
   */
  showMainImage: bool(false),
  showGallery: bool(true),
  /** 0 keeps every gallery image an administrator attached. */
  galleryLimit: z.coerce.number().int().min(0).max(24).catch(0).default(0),
  /**
   * Sizes come from Products → Design so every product page matches. A single
   * product can still override them here when it genuinely differs.
   */
  overrideSize: bool(false),
  mainMaxWidth: z.string().max(16).catch('').default(''),
  mainRatio: z.enum(['16/9', '4/3', '3/2', '1/1', '21/9', 'auto']).catch('auto').default('auto'),
  mainFit: z.enum(['cover', 'contain', 'fill', 'none']).catch('cover').default('cover'),
  galleryColumns: z.coerce.number().int().min(1).max(6).catch(3).default(3),
});

const productDescriptionSchema = z.object({
  heading: heading(''),
  /** Off falls back to the market's short description when there is no body. */
  fallbackToShort: bool(true),
});

const productFeaturesSchema = z.object({
  showFeatures: bool(true),
  featuresHeading: heading('What is included'),
  showBenefits: bool(true),
  benefitsHeading: heading('Why teams choose it'),
  columns: z.coerce.number().int().min(1).max(3).catch(2).default(2),
  ...responsiveColumnsSchema,
  /** 0 lists every feature and benefit the product carries. */
  limit: z.coerce.number().int().min(0).max(40).catch(0).default(0),
  showIcons: bool(true),
});

const productSpecsSchema = z.object({
  heading: heading('Specifications'),
  layout: z.enum(['table', 'list']).catch('table').default('table'),
  showStorage: bool(true),
  showUsers: bool(true),
  showSku: bool(false),
});

const productRelatedSchema = z.object({
  heading: heading('Other plans'),
  source: z.enum(['category', 'brand', 'featured', 'latest']).catch('category').default('category'),
  limit: z.coerce.number().int().min(1).max(12).catch(3).default(3),
  columns: z.coerce.number().int().min(1).max(4).catch(3).default(3),
  ...responsiveColumnsSchema,
  showPrice: bool(true),
  showFeatures: bool(false),
});

// ---------------------------------------------------------------------------
// Sidebar surface
// ---------------------------------------------------------------------------

const productPriceBoxSchema = z.object({
  showMonthly: bool(true),
  showAnnual: bool(true),
  showCompareAt: bool(true),
  showCta: bool(true),
  ctaLabel: z.string().max(60).catch('').default(''),
  showSpecs: bool(true),
  specsHeading: heading(''),
  note: z
    .string()
    .max(600)
    .catch('')
    .default(
      'Prices exclude applicable taxes. You receive the same product with local billing and support.',
    ),
  sticky: bool(true),

  /*
   * An enquiry form inside the box, under or over the price.
   *
   * Off by default, so every price box that exists today is unchanged. A blank
   * `formSlug` means the product's own enquiry form — the one the button
   * already opens — so switching this on is usually the only decision to make,
   * and a box that follows the product keeps following it when the product's
   * form is changed.
   */
  showForm: bool(false),
  formSlug: z.string().max(120).catch('').default(''),
  formHeading: heading(''),
  formPosition: z.enum(['below', 'above']).catch('below').default('below'),
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PRODUCT_BLOCKS: Record<string, BlockDefinition> = {
  productHeader: {
    type: 'productHeader',
    label: 'Product header',
    description: 'Breadcrumb, category, brand, the product name and its short description.',
    group: 'Products',
    icon: 'text',
    surfaces: ['productDetail'],
    singleton: true,
    schema: productHeaderSchema,
    fields: [
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      { kind: 'boolean', name: 'showBreadcrumb', label: 'Show breadcrumb', width: 'half' },
      {
        kind: 'text',
        name: 'homeLabel',
        label: 'Home crumb label',
        width: 'half',
        showWhen: { field: 'showBreadcrumb', equals: [true] },
      },
      {
        kind: 'url',
        name: 'homeUrl',
        label: 'Home crumb link',
        width: 'half',
        placeholder: 'This market’s home page',
        showWhen: { field: 'showBreadcrumb', equals: [true] },
      },
      {
        kind: 'boolean',
        name: 'showProductsCrumb',
        label: 'Show the middle crumb',
        width: 'half',
        showWhen: { field: 'showBreadcrumb', equals: [true] },
      },
      {
        kind: 'text',
        name: 'productsLabel',
        label: 'Middle crumb label',
        width: 'half',
        showWhen: { field: 'showProductsCrumb', equals: [true] },
      },
      {
        kind: 'url',
        name: 'productsUrl',
        label: 'Middle crumb link',
        width: 'half',
        placeholder: '/pricing',
        showWhen: { field: 'showProductsCrumb', equals: [true] },
      },
      { kind: 'boolean', name: 'showCategory', label: 'Show category', width: 'half' },
      {
        kind: 'boolean',
        name: 'linkCategory',
        label: 'Link the category to its page',
        width: 'half',
        showWhen: { field: 'showCategory', equals: [true] },
      },
      { kind: 'boolean', name: 'showBrand', label: 'Show brand', width: 'half' },
      {
        kind: 'boolean',
        name: 'linkBrand',
        label: 'Link the brand to its page',
        width: 'half',
        showWhen: { field: 'showBrand', equals: [true] },
      },
      { kind: 'boolean', name: 'showSku', label: 'Show SKU', width: 'half' },
      {
        kind: 'boolean',
        name: 'showShortDescription',
        label: 'Show short description',
        width: 'half',
      },
      {
        kind: 'select',
        name: 'titleTag',
        label: 'Product name heading level',
        width: 'half',
        options: [
          { label: 'H1 — the page is about this product', value: 'h1' },
          { label: 'H2', value: 'h2' },
          { label: 'H3', value: 'h3' },
          { label: 'H4', value: 'h4' },
          { label: 'H5', value: 'h5' },
          { label: 'H6', value: 'h6' },
        ],
        help: 'Only one H1 per page. Drop this to H2 when a section above it already has one.',
      },
      {
        kind: 'text',
        name: 'titleSize',
        label: 'Product name size',
        width: 'half',
        placeholder: 'e.g. 32px or 2rem',
        help: 'Blank keeps the built-in size, which grows with the screen.',
      },
      {
        kind: 'boolean',
        name: 'showImage',
        label: 'Show the product image beside the text',
        width: 'half',
        help: 'Hide the separate “Product images” section when you turn this on, or it appears twice.',
      },
      {
        kind: 'select',
        name: 'imagePosition',
        label: 'Image side',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      {
        kind: 'text',
        name: 'imageWidth',
        label: 'Image size',
        width: 'half',
        placeholder: '250px',
        help: 'The width. With a square ratio, 250px means 250 × 250.',
      },
      {
        kind: 'select',
        name: 'imageRatio',
        label: 'Image ratio',
        width: 'half',
        options: [
          { label: 'Square (1:1)', value: '1/1' },
          { label: 'Landscape (4:3)', value: '4/3' },
          { label: 'Landscape (3:2)', value: '3/2' },
          { label: 'Widescreen (16:9)', value: '16/9' },
          { label: 'Original', value: 'auto' },
        ],
      },
      {
        kind: 'select',
        name: 'imageFit',
        label: 'Image fit',
        width: 'half',
        options: [
          { label: 'Contain — the whole image, letterboxed', value: 'contain' },
          { label: 'Cover — fills the box, crops the edges', value: 'cover' },
          { label: 'Fill — stretches to the box', value: 'fill' },
          { label: 'None', value: 'none' },
        ],
      },
      { kind: 'boolean', name: 'imageBorder', label: 'Draw a border round it', width: 'half' },
    ],
  },

  productMedia: {
    type: 'productMedia',
    label: 'Product images',
    description: 'The main image and the gallery beneath it.',
    group: 'Products',
    icon: 'image',
    surfaces: ['productDetail'],
    singleton: true,
    schema: productMediaSchema,
    fields: [
      { kind: 'boolean', name: 'showMainImage', label: 'Show the main image', width: 'half' },
      { kind: 'boolean', name: 'showGallery', label: 'Show the gallery', width: 'half' },
      {
        kind: 'number',
        name: 'galleryLimit',
        label: 'Maximum gallery images',
        width: 'half',
        min: 0,
        max: 24,
        help: '0 shows every image attached to the product.',
      },
      {
        kind: 'boolean',
        name: 'overrideSize',
        label: 'Use custom sizes for this product',
        width: 'half',
        help: 'Off follows Products → Design, so every product page matches.',
      },
      {
        kind: 'text',
        name: 'mainMaxWidth',
        label: 'Main image width',
        width: 'half',
        placeholder: 'e.g. 720px or 100%',
      },
      {
        kind: 'select',
        name: 'mainRatio',
        label: 'Main image ratio',
        width: 'half',
        options: [
          { label: 'Original', value: 'auto' },
          { label: 'Widescreen (16:9)', value: '16/9' },
          { label: 'Landscape (4:3)', value: '4/3' },
          { label: 'Landscape (3:2)', value: '3/2' },
          { label: 'Square (1:1)', value: '1/1' },
          { label: 'Ultrawide (21:9)', value: '21/9' },
        ],
      },
      {
        kind: 'select',
        name: 'mainFit',
        label: 'Main image fit',
        width: 'half',
        options: [
          { label: 'Cover', value: 'cover' },
          { label: 'Contain', value: 'contain' },
          { label: 'Fill', value: 'fill' },
          { label: 'None', value: 'none' },
        ],
      },
      {
        kind: 'number',
        name: 'galleryColumns',
        label: 'Gallery columns',
        width: 'half',
        min: 1,
        max: 6,
      },
    ],
  },

  productDescription: {
    type: 'productDescription',
    label: 'Product description',
    description: "The product's long description, as written on the product.",
    group: 'Products',
    icon: 'file',
    surfaces: ['productDetail'],
    singleton: true,
    schema: productDescriptionSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading', placeholder: 'No heading' },
      {
        kind: 'boolean',
        name: 'fallbackToShort',
        label: 'Use the short description when there is no body',
        width: 'half',
      },
    ],
  },

  productFeatures: {
    type: 'productFeatures',
    label: 'Features & benefits',
    description: "Everything the product includes, and why teams choose it.",
    group: 'Products',
    icon: 'check',
    surfaces: ['productDetail'],
    schema: productFeaturesSchema,
    fields: [
      { kind: 'boolean', name: 'showFeatures', label: 'Show features', width: 'half' },
      { kind: 'text', name: 'featuresHeading', label: 'Features heading', width: 'half' },
      { kind: 'boolean', name: 'showBenefits', label: 'Show benefits', width: 'half' },
      { kind: 'text', name: 'benefitsHeading', label: 'Benefits heading', width: 'half' },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 1, max: 3 },
      ...responsiveColumnFields,
      {
        kind: 'number',
        name: 'limit',
        label: 'Maximum items',
        width: 'half',
        min: 0,
        max: 40,
        help: '0 lists every feature and benefit.',
      },
      { kind: 'boolean', name: 'showIcons', label: 'Show tick icons', width: 'half' },
    ],
  },

  productSpecs: {
    type: 'productSpecs',
    label: 'Specifications',
    description: "The product's specification table, plus storage and seat counts.",
    group: 'Products',
    icon: 'table',
    surfaces: ['productDetail', 'productSidebar'],
    singleton: true,
    schema: productSpecsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Table', value: 'table' },
          { label: 'List', value: 'list' },
        ],
      },
      { kind: 'boolean', name: 'showStorage', label: 'Show storage row', width: 'half' },
      { kind: 'boolean', name: 'showUsers', label: 'Show users row', width: 'half' },
      { kind: 'boolean', name: 'showSku', label: 'Show SKU row', width: 'half' },
    ],
  },

  productRelated: {
    type: 'productRelated',
    label: 'Other plans',
    description: 'A rail of related products, as cards.',
    group: 'Products',
    icon: 'package',
    surfaces: ['productDetail'],
    schema: productRelatedSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      {
        kind: 'select',
        name: 'source',
        label: 'Which products',
        width: 'half',
        options: [
          { label: 'Same category', value: 'category' },
          { label: 'Same brand', value: 'brand' },
          { label: 'Featured', value: 'featured' },
          { label: 'Latest', value: 'latest' },
        ],
      },
      { kind: 'number', name: 'limit', label: 'How many', width: 'half', min: 1, max: 12 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 1, max: 4 },
      ...responsiveColumnFields,
      { kind: 'boolean', name: 'showPrice', label: 'Show pricing', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show feature list', width: 'half' },
    ],
  },

  productPriceBox: {
    type: 'productPriceBox',
    label: 'Price box',
    description: 'Price, call to action, specifications and the small print.',
    group: 'Products',
    icon: 'tag',
    surfaces: ['productSidebar'],
    singleton: true,
    schema: productPriceBoxSchema,
    formFields: formStyleGroups({ heading: 'formHeading', card: false }),
    fields: [
      { kind: 'boolean', name: 'showMonthly', label: 'Show the monthly price', width: 'half' },
      { kind: 'boolean', name: 'showAnnual', label: 'Show the annual price', width: 'half' },
      { kind: 'boolean', name: 'showCompareAt', label: 'Show the was-price', width: 'half' },
      { kind: 'boolean', name: 'showCta', label: 'Show the button', width: 'half' },
      {
        kind: 'text',
        name: 'ctaLabel',
        label: 'Button label',
        width: 'half',
        placeholder: "The product's own label",
      },
      { kind: 'boolean', name: 'showSpecs', label: 'Show specifications', width: 'half' },
      { kind: 'text', name: 'specsHeading', label: 'Specifications heading', width: 'half' },
      {
        kind: 'boolean',
        name: 'sticky',
        label: 'Stick to the top while scrolling',
        width: 'half',
        help: 'Follows Products → Design when that is switched off.',
      },
      { kind: 'textarea', name: 'note', label: 'Small print', rows: 3 },
      {
        kind: 'boolean',
        name: 'showForm',
        label: 'Show an enquiry form in the box',
        width: 'half',
      },
      {
        kind: 'select',
        name: 'formPosition',
        label: 'Where the form sits',
        width: 'half',
        showWhen: { field: 'showForm', equals: [true] },
        options: [
          { label: 'Below the price', value: 'below' },
          { label: 'Above the price', value: 'above' },
        ],
      },
      {
        kind: 'form',
        name: 'formSlug',
        label: 'Form',
        width: 'half',
        showWhen: { field: 'showForm', equals: [true] },
        help: `Leave empty to use the product's own enquiry form. ${FORM_PICKER_HELP}`,
      },
    ],
  },
};

export type ProductHeaderContent = z.infer<typeof productHeaderSchema>;
export type ProductMediaContent = z.infer<typeof productMediaSchema>;
export type ProductDescriptionContent = z.infer<typeof productDescriptionSchema>;
export type ProductFeaturesContent = z.infer<typeof productFeaturesSchema>;
export type ProductSpecsContent = z.infer<typeof productSpecsSchema>;
export type ProductRelatedContent = z.infer<typeof productRelatedSchema>;
export type ProductPriceBoxContent = z.infer<typeof productPriceBoxSchema>;
