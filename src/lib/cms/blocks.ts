import { z } from 'zod';
import { panelDesignSchema } from '@/lib/cms/design';
import type { FieldDescriptor } from './fields';
import {
  BLOCK_GROUPS,
  BLOCK_SURFACES,
  BLOCK_SURFACE_LABELS,
  linkFields,
  type BlockDefinition,
  type BlockGroup,
  type BlockSurface,
  PAGE_BLOCK_SURFACES,
  responsiveColumnsSchema,
  responsiveColumnFields,
} from './block-types';
import { BLOG_BLOCKS } from './blog-blocks';
import { PRODUCT_BLOCKS } from './product-blocks';
import { SLIDER_BLOCKS } from './slider-blocks';
import { productSourceFields } from './product-source';
import { formStyleField, formStyleGroups, FORM_PICKER_HELP } from './form-style';

/**
 * Block registry.
 *
 * Each entry pairs a Zod schema (validation + defaults) with a declarative field
 * list (drives the generated admin editor). Adding a block here plus a renderer
 * in components/cms/blocks makes it immediately available in the page builder.
 *
 * Blog blocks live in `blog-blocks.ts` and the slider sections in
 * `slider-blocks.ts`, but all of them land in the same registry, so the page
 * builder and the blog builder share one lookup, one editor and one renderer
 * dispatch rather than growing a competing system.
 */

export {
  BLOCK_GROUPS,
  BLOCK_SURFACES,
  BLOCK_SURFACE_LABELS,
  type BlockGroup,
  type BlockSurface,
  type BlockDefinition,
};

// --- shared content fragments ----------------------------------------------
const objectFit = z.enum(['cover', 'contain', 'fill', 'none']).catch('cover').default('cover');
const objectPosition = z
  .enum([
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top left',
    'top right',
    'bottom left',
    'bottom right',
  ])
  .catch('center')
  .default('center');
const imageRatio = z
  .enum(['auto', '1/1', '4/3', '3/2', '16/9', '3/4', '2/3'])
  .catch('auto')
  .default('auto');
const cssLength = z.string().max(16).default('');

// --- hero ------------------------------------------------------------------
const heroSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  /** Chooses which optional slots the hero renders. */
  layout: z
    .enum(['content', 'contentImage', 'contentForm', 'contentImageForm', 'backgroundImage'])
    .catch('content')
    .default('content'),
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default('A headline that states the offer'),
  description: z.string().max(1200).default(''),
  bullets: z.array(z.string().max(160)).default([]),
  badges: z
    .array(
      z.object({ label: z.string().max(80).default(''), icon: z.string().max(40).default('') }),
    )
    .default([]),

  // Image slot — every part optional.
  imageId: z.string().nullable().default(null),
  imageAlt: z.string().max(200).default(''),
  imageWidth: cssLength,
  imageRatio,
  imageFit: objectFit,
  imagePosition: objectPosition,
  imagePlacement: z.enum(['right', 'left']).catch('right').default('right'),

  // Form slot — the form itself is chosen from Form management, never hardcoded.
  showForm: z.boolean().default(false),
  formSlug: z.string().max(120).default(''),
  formHeading: z.string().max(160).default(''),
  formDescription: z.string().max(400).default(''),
  /**
   * Internal CTA attribution. Names *where on the site* this form sits, so a
   * lead can be traced to the placement that converted it — separately from
   * utm_source, which belongs to the external campaign that brought them.
   * Blank falls back to the block's own default, so existing sections keep the
   * label they already report under.
   */
  ctaLocation: z.string().max(120).default(''),

  primaryCtaLabel: z.string().max(60).default(''),
  primaryCtaUrl: z.string().max(500).default(''),
  secondaryCtaLabel: z.string().max(60).default(''),
  secondaryCtaUrl: z.string().max(500).default(''),
  alignment: z.enum(['left', 'center']).default('left'),
});

// --- richText --------------------------------------------------------------
const richTextSchema = z.object({
  heading: z.string().max(240).default(''),
  content: z.string().default(''),
  width: z.enum(['narrow', 'default']).default('narrow'),
  align: z.enum(['left', 'center']).default('left'),
});

// --- featureGrid -----------------------------------------------------------
const featureGridSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(2).max(4).default(3),
  ...responsiveColumnsSchema,
  style: z.enum(['card', 'plain']).default('card'),
  items: z
    .array(
      z.object({
        title: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
        icon: z.string().max(40).default(''),
        imageId: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

// --- imageContent ----------------------------------------------------------
const imageContentSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().default(''),
  imageId: z.string().nullable().default(null),
  imagePosition: z.enum(['left', 'right']).default('right'),
  ctaLabel: z.string().max(60).default(''),
  ctaUrl: z.string().max(500).default(''),
});

// --- productCards ----------------------------------------------------------
const productCardsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  source: z.enum(['featured', 'all', 'category', 'selected', 'latest']).default('featured'),
  categoryId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(3),
  columns: z.coerce.number().int().min(2).max(4).default(3),
  ...responsiveColumnsSchema,
  showImage: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  showFeatures: z.boolean().default(true),
  /**
   * The product's benefits and specifications, alongside the features. Both
   * default on so everything an administrator entered reaches the visitor.
   */
  showBenefits: z.boolean().default(true),
  showSpecs: z.boolean().default(true),
  /** 0 — the default — lists every feature, benefit and specification. */
  featureLimit: z.coerce.number().int().min(0).max(40).catch(0).default(0),
  showCta: z.boolean().default(true),
  /**
   * Card appearance and action toggles. Every one defaults to true, which is
   * exactly what these blocks rendered before the toggles existed — so a
   * section saved earlier is unchanged by this.
   */
  showName: z.boolean().default(true),
  linkName: z.boolean().default(true),
  showDetailsLink: z.boolean().default(true),
  showActions: z.boolean().default(true),
  billing: z.enum(['monthly', 'annual']).default('monthly'),
});

// --- productTable ----------------------------------------------------------
const productTableSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  source: z.enum(['featured', 'all', 'category', 'selected', 'latest']).default('all'),
  categoryId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(6),
  showStorage: z.boolean().default(true),
  showUsers: z.boolean().default(true),
  showMonthly: z.boolean().default(true),
  showAnnual: z.boolean().default(true),
  showFeatures: z.boolean().default(true),
  /**
   * The product's benefits and specifications, alongside the features. Both
   * default on so everything an administrator entered reaches the visitor.
   */
  showBenefits: z.boolean().default(true),
  showSpecs: z.boolean().default(true),
  /** 0 — the default — lists every feature, benefit and specification. */
  featureLimit: z.coerce.number().int().min(0).max(40).catch(0).default(0),
  ctaLabel: z.string().max(60).default('Get a quote'),
});

// --- faq -------------------------------------------------------------------
const faqSchema = z.object({
  heading: z.string().max(240).default('Frequently asked questions'),
  description: z.string().max(800).default(''),
  layout: z.enum(['single', 'split']).default('split'),
  items: z
    .array(
      z.object({
        question: z.string().max(300).default(''),
        answer: z.string().default(''),
      }),
    )
    .default([]),
});

// --- testimonials ----------------------------------------------------------
const testimonialsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(3).default(3),
  ...responsiveColumnsSchema,
  items: z
    .array(
      z.object({
        quote: z.string().max(1200).default(''),
        name: z.string().max(120).default(''),
        role: z.string().max(120).default(''),
        company: z.string().max(120).default(''),
        imageId: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

// --- cta -------------------------------------------------------------------
const ctaSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  primaryCtaLabel: z.string().max(60).default(''),
  primaryCtaUrl: z.string().max(500).default(''),
  /** Off hides the primary button even when a label is set. */
  showPrimaryCta: z.boolean().default(true),
  secondaryCtaLabel: z.string().max(60).default(''),
  secondaryCtaUrl: z.string().max(500).default(''),
  showSecondaryCta: z.boolean().default(true),
  alignment: z.enum(['left', 'center', 'right']).catch('center').default('center'),
  formSlug: z.string().max(120).default(''),
  /**
   * `simple` is the new unstyled variant; `plain` is kept as its historical
   * name so sections saved under it keep rendering the same way.
   */
  variant: z.enum(['panel', 'plain', 'simple', 'split']).catch('panel').default('panel'),
  /**
   * Styling for the panel itself, distinct from the section band around it.
   * Defaults are empty, so an untouched CTA keeps its original brand panel.
   */
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
  /**
   * Internal CTA attribution. Names *where on the site* this form sits, so a
   * lead can be traced to the placement that converted it — separately from
   * utm_source, which belongs to the external campaign that brought them.
   * Blank falls back to the block's own default, so existing sections keep the
   * label they already report under.
   */
  ctaLocation: z.string().max(120).default(''),
});

// --- leadMagnet ------------------------------------------------------------
const leadMagnetSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  leadMagnetSlug: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  imageId: z.string().nullable().default(null),
  formSlug: z.string().max(120).default(''),
  ctaLabel: z.string().max(60).default('Download'),
  /**
   * Internal CTA attribution. Names *where on the site* this form sits, so a
   * lead can be traced to the placement that converted it — separately from
   * utm_source, which belongs to the external campaign that brought them.
   * Blank falls back to the block's own default, so existing sections keep the
   * label they already report under.
   */
  ctaLocation: z.string().max(120).default(''),
});

// --- formBlock -------------------------------------------------------------
const formBlockSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  formSlug: z.string().max(120).default(''),
  layout: z.enum(['single', 'split']).default('single'),
  sideHeading: z.string().max(240).default(''),
  sideBullets: z.array(z.string().max(200)).default([]),
  /**
   * Internal CTA attribution. Names *where on the site* this form sits, so a
   * lead can be traced to the placement that converted it — separately from
   * utm_source, which belongs to the external campaign that brought them.
   * Blank falls back to the block's own default, so existing sections keep the
   * label they already report under.
   */
  ctaLocation: z.string().max(120).default(''),
});

// --- logoWall --------------------------------------------------------------
const logoWallSchema = z.object({
  heading: z.string().max(240).default(''),
  logos: z
    .array(
      z.object({
        label: z.string().max(80).default(''),
        imageId: z.string().nullable().default(null),
        url: z.string().max(500).default(''),
      }),
    )
    .default([]),
});

// --- stats -----------------------------------------------------------------
const statsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(600).default(''),
  items: z
    .array(
      z.object({
        value: z.string().max(40).default(''),
        label: z.string().max(160).default(''),
      }),
    )
    .default([]),
});

// --- steps -----------------------------------------------------------------
const stepsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  items: z
    .array(
      z.object({
        title: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
      }),
    )
    .default([]),
});

// --- card / box family ------------------------------------------------------
const cardCtaFields = z.object({
  ctaLabel: z.string().max(60).default(''),
  ctaUrl: z.string().max(500).default(''),
});

const imageCardsSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(6).default(3),
  ...responsiveColumnsSchema,
  maxRows: z.coerce.number().int().min(0).max(20).default(0),
  imageRatio,
  imageFit: objectFit,
  cardAlign: z.enum(['left', 'center']).catch('left').default('left'),
  cardStyle: z.enum(['card', 'plain', 'overlay']).catch('card').default('card'),
  items: z
    .array(
      cardCtaFields.extend({
        imageId: z.string().nullable().default(null),
        imageAlt: z.string().max(200).default(''),
        heading: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
        linkUrl: z.string().max(500).default(''),
      }),
    )
    .default([]),
});

const iconCardsSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(6).default(3),
  ...responsiveColumnsSchema,
  iconSize: cssLength,
  iconPosition: z.enum(['top', 'left']).catch('top').default('top'),
  iconStyle: z.enum(['plain', 'circle', 'square']).catch('circle').default('circle'),
  cardAlign: z.enum(['left', 'center']).catch('left').default('left'),
  cardStyle: z.enum(['card', 'plain']).catch('card').default('card'),
  items: z
    .array(
      cardCtaFields.extend({
        icon: z.string().max(40).default(''),
        imageId: z.string().nullable().default(null),
        heading: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
        linkUrl: z.string().max(500).default(''),
      }),
    )
    .default([]),
});

const imageBoxSchema = z.object({
  layout: z
    .enum(['imageLeft', 'imageRight', 'imageTop', 'backgroundImage'])
    .catch('imageLeft')
    .default('imageLeft'),
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  text: z.string().default(''),
  imageId: z.string().nullable().default(null),
  imageAlt: z.string().max(200).default(''),
  imageWidth: cssLength,
  imageRatio,
  imageFit: objectFit,
  imagePosition: objectPosition,
  ...cardCtaFields.shape,
});

const iconBoxSchema = z.object({
  icon: z.string().max(40).default('star'),
  imageId: z.string().nullable().default(null),
  iconSize: cssLength,
  iconAlign: z.enum(['left', 'center']).catch('left').default('left'),
  iconStyle: z.enum(['plain', 'circle', 'square']).catch('circle').default('circle'),
  heading: z.string().max(240).default(''),
  description: z.string().max(1200).default(''),
  linkUrl: z.string().max(500).default(''),
  ...cardCtaFields.shape,
});

const listSectionSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(4).default(1),
  ...responsiveColumnsSchema,
  marker: z.enum(['check', 'bullet', 'number', 'icon', 'none']).catch('check').default('check'),
  items: z
    .array(
      z.object({
        text: z.string().max(400).default(''),
        description: z.string().max(600).default(''),
        icon: z.string().max(40).default(''),
        url: z.string().max(500).default(''),
      }),
    )
    .default([]),
});

const headingTextSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  subheading: z.string().max(400).default(''),
  content: z.string().default(''),
  align: z.enum(['left', 'center']).catch('left').default('left'),
  ...cardCtaFields.shape,
});

const textListImageSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  subheading: z.string().max(400).default(''),
  description: z.string().default(''),
  imagePlacement: z.enum(['left', 'right', 'top', 'bottom']).catch('right').default('right'),
  imageId: z.string().nullable().default(null),
  imageAlt: z.string().max(200).default(''),
  imageRatio,
  imageFit: objectFit,
  marker: z.enum(['check', 'bullet', 'number', 'icon', 'none']).catch('check').default('check'),
  items: z
    .array(
      z.object({
        text: z.string().max(400).default(''),
        icon: z.string().max(40).default(''),
      }),
    )
    .default([]),
  primaryCtaLabel: z.string().max(60).default(''),
  primaryCtaUrl: z.string().max(500).default(''),
  secondaryCtaLabel: z.string().max(60).default(''),
  secondaryCtaUrl: z.string().max(500).default(''),
});

// --- statistics -------------------------------------------------------------
const statisticsSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(6).default(4),
  ...responsiveColumnsSchema,
  align: z.enum(['left', 'center']).catch('center').default('center'),
  style: z.enum(['plain', 'card', 'divided']).catch('card').default('card'),
  items: z
    .array(
      z.object({
        value: z.string().max(24).default(''),
        prefix: z.string().max(8).default(''),
        suffix: z.string().max(8).default(''),
        label: z.string().max(160).default(''),
        description: z.string().max(300).default(''),
        icon: z.string().max(40).default(''),
      }),
    )
    .default([]),
});

// --- productGrid ------------------------------------------------------------
const productGridSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  source: z
    .enum(['all', 'selected', 'featured', 'category', 'brand', 'latest'])
    .catch('featured')
    .default('featured'),
  categoryId: z.string().nullable().default(null),
  brandId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(24).default(6),
  columns: z.coerce.number().int().min(1).max(4).default(3),
  ...responsiveColumnsSchema,
  layout: z.enum(['grid', 'list']).catch('grid').default('grid'),
  billing: z.enum(['monthly', 'annual']).catch('monthly').default('monthly'),
  showImage: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  showFeatures: z.boolean().default(true),
  /**
   * The product's benefits and specifications, alongside the features. Both
   * default on so everything an administrator entered reaches the visitor.
   */
  showBenefits: z.boolean().default(true),
  showSpecs: z.boolean().default(true),
  /** 0 — the default — lists every feature, benefit and specification. */
  featureLimit: z.coerce.number().int().min(0).max(40).catch(0).default(0),
  showCta: z.boolean().default(true),
  /**
   * Card appearance and action toggles. Every one defaults to true, which is
   * exactly what these blocks rendered before the toggles existed — so a
   * section saved earlier is unchanged by this.
   */
  showName: z.boolean().default(true),
  linkName: z.boolean().default(true),
  showDetailsLink: z.boolean().default(true),
  showActions: z.boolean().default(true),
  ctaLabel: z.string().max(60).default(''),
});

const RATIO_OPTIONS = [
  { label: 'Original', value: 'auto' },
  { label: 'Square (1:1)', value: '1/1' },
  { label: 'Landscape (4:3)', value: '4/3' },
  { label: 'Landscape (3:2)', value: '3/2' },
  { label: 'Widescreen (16:9)', value: '16/9' },
  { label: 'Portrait (3:4)', value: '3/4' },
  { label: 'Portrait (2:3)', value: '2/3' },
];

const FIT_OPTIONS = [
  { label: 'Cover (fills the frame)', value: 'cover' },
  { label: 'Contain (whole image visible)', value: 'contain' },
  { label: 'Stretch', value: 'fill' },
  { label: 'None', value: 'none' },
];

const POSITION_OPTIONS = [
  { label: 'Centre', value: 'center' },
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Top left', value: 'top left' },
  { label: 'Top right', value: 'top right' },
  { label: 'Bottom left', value: 'bottom left' },
  { label: 'Bottom right', value: 'bottom right' },
];

const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Centre', value: 'center' },
];

const ICON_STYLE_OPTIONS = [
  { label: 'Rounded badge', value: 'circle' },
  { label: 'Square badge', value: 'square' },
  { label: 'No badge', value: 'plain' },
];

const MARKER_OPTIONS = [
  { label: 'Tick', value: 'check' },
  { label: 'Bullet', value: 'bullet' },
  { label: 'Number', value: 'number' },
  { label: 'Per-item icon', value: 'icon' },
  { label: 'None', value: 'none' },
];


const PAGE_BLOCKS: Record<string, BlockDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    description: 'Large headline, supporting copy and up to two calls to action.',
    group: 'Content',
    icon: 'layout-template',
    schema: heroSchema,
    design: ['buttons'],
    formFields: formStyleGroups({ heading: 'formHeading', description: 'formDescription' }),
    fields: [
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        help: 'Decides which of the optional slots the hero shows.',
        options: [
          { label: 'Content only', value: 'content' },
          { label: 'Content + image', value: 'contentImage' },
          { label: 'Content + form', value: 'contentForm' },
          { label: 'Content + image + form', value: 'contentImageForm' },
          { label: 'Background image', value: 'backgroundImage' },
        ],
      },
      {
        kind: 'text',
        name: 'eyebrow',
        label: 'Eyebrow',
        width: 'half',
        help: 'Small label above the heading',
      },
      {
        kind: 'select',
        name: 'alignment',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 3 },
      {
        kind: 'repeater',
        name: 'bullets',
        label: 'Bullet points',
        itemLabel: 'Bullet',
        titleField: 'value',
        fields: [{ kind: 'text', name: 'value', label: 'Text' }],
      },
      { kind: 'media', name: 'imageId', label: 'Image' },
      ...linkFields('primaryCta', 'Primary button'),
      ...linkFields('secondaryCta', 'Secondary button'),
      {
        kind: 'form',
        name: 'formSlug',
        label: 'Form',
        width: 'half',
        help: `Shown by the “Content + form” layouts. ${FORM_PICKER_HELP}`,
      },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        width: 'half',
        help: 'Optional. Names this placement on leads it captures, e.g. homepage_hero. Separate from UTM campaign tracking.',
      },
    ],
  },

  richText: {
    type: 'richText',
    label: 'Rich text',
    description: 'A heading with formatted body copy.',
    group: 'Content',
    icon: 'text',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: richTextSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'richtext', name: 'content', label: 'Content' },
      {
        kind: 'select',
        name: 'width',
        label: 'Text width',
        width: 'half',
        options: [
          { label: 'Narrow', value: 'narrow' },
          { label: 'Default', value: 'default' },
        ],
      },
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
    ],
  },

  featureGrid: {
    type: 'featureGrid',
    label: 'Feature grid',
    description: 'A grid of benefits or features with optional icons.',
    group: 'Content',
    icon: 'grid-3x3',
    surfaces: ['page', 'blogListing'],
    schema: featureGridSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 2, max: 4 },
      ...responsiveColumnFields,
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Cards', value: 'card' },
          { label: 'Plain', value: 'plain' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Features',
        itemLabel: 'Feature',
        titleField: 'title',
        fields: [
          { kind: 'text', name: 'title', label: 'Title' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
          {
            kind: 'text',
            name: 'icon',
            label: 'Icon name',
            width: 'half',
            help: 'Lucide icon name, e.g. shield, zap, users',
          },
          { kind: 'media', name: 'imageId', label: 'Image (overrides icon)', width: 'half' },
        ],
      },
    ],
  },

  imageContent: {
    type: 'imageContent',
    label: 'Image + content',
    description: 'An image beside a block of copy and an optional button.',
    group: 'Content',
    icon: 'image',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: imageContentSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      {
        kind: 'select',
        name: 'imagePosition',
        label: 'Image position',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'richtext', name: 'description', label: 'Content' },
      { kind: 'media', name: 'imageId', label: 'Image' },
      ...linkFields('cta', 'Button'),
    ],
  },

  productCards: {
    type: 'productCards',
    label: 'Product cards',
    description: 'Product plans displayed as pricing cards.',
    group: 'Products',
    icon: 'package',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: productCardsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      ...productSourceFields,
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 2, max: 4 },
      ...responsiveColumnFields,
      {
        kind: 'select',
        name: 'billing',
        label: 'Show price for',
        width: 'half',
        options: [
          { label: 'Monthly', value: 'monthly' },
          { label: 'Annual', value: 'annual' },
        ],
      },
      { kind: 'boolean', name: 'showImage', label: 'Show product image', width: 'half' },
      { kind: 'boolean', name: 'showDescription', label: 'Show description', width: 'half' },
      { kind: 'boolean', name: 'showPrice', label: 'Show pricing', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show feature list', width: 'half' },
      { kind: 'boolean', name: 'showBenefits', label: 'Show benefits', width: 'half' },
      { kind: 'boolean', name: 'showSpecs', label: 'Show specifications', width: 'half' },
      {
        kind: 'number',
        name: 'featureLimit',
        label: 'Maximum list items',
        width: 'half',
        min: 0,
        max: 40,
        help: 'Applies to features, benefits and specifications. 0 shows every one.',
      },
      { kind: 'boolean', name: 'showName', label: 'Show product name', width: 'half' },
      {
        kind: 'boolean',
        name: 'linkName',
        label: 'Product name links to the product',
        width: 'half',
        help: 'Off renders the name as plain text.',
      },
      {
        kind: 'boolean',
        name: 'showActions',
        label: 'Show all actions',
        width: 'half',
        help: 'Off hides the button and the details link together.',
      },
      { kind: 'boolean', name: 'showCta', label: 'Show primary button', width: 'half' },
      {
        kind: 'boolean',
        name: 'showDetailsLink',
        label: 'Show “View full details”',
        width: 'half',
      },
    ],
  },

  productTable: {
    type: 'productTable',
    label: 'Product comparison table',
    description: 'Side-by-side plan comparison. Becomes cards on mobile.',
    group: 'Products',
    icon: 'table',
    schema: productTableSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      ...productSourceFields,
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
      { kind: 'boolean', name: 'showStorage', label: 'Show storage row', width: 'half' },
      { kind: 'boolean', name: 'showUsers', label: 'Show users row', width: 'half' },
      { kind: 'boolean', name: 'showMonthly', label: 'Show monthly price', width: 'half' },
      { kind: 'boolean', name: 'showAnnual', label: 'Show annual price', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show features', width: 'half' },
      { kind: 'boolean', name: 'showBenefits', label: 'Show benefits', width: 'half' },
      { kind: 'boolean', name: 'showSpecs', label: 'Show specifications', width: 'half' },
      {
        kind: 'number',
        name: 'featureLimit',
        label: 'Maximum list items',
        width: 'half',
        min: 0,
        max: 40,
        help: 'Applies to features, benefits and specifications. 0 shows every one.',
      },
    ],
  },

  faq: {
    type: 'faq',
    label: 'FAQ',
    description: 'Expandable questions and answers. Emits FAQ structured data.',
    group: 'Content',
    icon: 'circle-help',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: faqSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Single column', value: 'single' },
          { label: 'Split (heading left)', value: 'split' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Questions',
        itemLabel: 'Question',
        titleField: 'question',
        fields: [
          { kind: 'text', name: 'question', label: 'Question' },
          { kind: 'richtext', name: 'answer', label: 'Answer' },
        ],
      },
    ],
  },

  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    description: 'Customer quotes with name, role and company.',
    group: 'Social proof',
    icon: 'quote',
    surfaces: ['page', 'blogListing'],
    schema: testimonialsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 1, max: 3 },
      ...responsiveColumnFields,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Testimonials',
        itemLabel: 'Testimonial',
        titleField: 'name',
        fields: [
          { kind: 'textarea', name: 'quote', label: 'Quote', rows: 3 },
          { kind: 'text', name: 'name', label: 'Name', width: 'half' },
          { kind: 'text', name: 'role', label: 'Role', width: 'half' },
          { kind: 'text', name: 'company', label: 'Company', width: 'half' },
          { kind: 'media', name: 'imageId', label: 'Photo', width: 'half' },
        ],
      },
    ],
  },

  cta: {
    type: 'cta',
    label: 'Call to action',
    description: 'A conversion panel with buttons or an inline form.',
    group: 'Conversion',
    icon: 'megaphone',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: ctaSchema,
    design: ['buttons'],
    formFields: formStyleGroups(),
    fields: [
      {
        kind: 'text',
        name: 'eyebrow',
        label: 'Eyebrow',
        width: 'half',
        help: 'Optional small label above the heading',
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'select',
        name: 'variant',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Simple', value: 'simple' },
          { label: 'Panel', value: 'panel' },
          { label: 'Split with form', value: 'split' },
          // Kept so sections saved under the old name keep their layout.
          { label: 'Plain (legacy)', value: 'plain' },
        ],
      },
      {
        kind: 'select',
        name: 'alignment',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
      {
        kind: 'form',
        name: 'formSlug',
        label: 'Inline form',
        width: 'half',
        help: `Used by the split layout. ${FORM_PICKER_HELP}`,
      },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        width: 'half',
        help: 'Optional. Names this placement on leads it captures, e.g. homepage_hero. Separate from UTM campaign tracking.',
      },
      ...linkFields('primaryCta', 'Primary button'),
      { kind: 'boolean', name: 'showPrimaryCta', label: 'Show primary button', width: 'half' },
      ...linkFields('secondaryCta', 'Secondary button'),
      { kind: 'boolean', name: 'showSecondaryCta', label: 'Show secondary button', width: 'half' },

      // --- Panel styling -----------------------------------------------------
      // Applies to the panel layout's box. The section's own background,
      // spacing and width stay where they already are, in the Design tab.
      {
        kind: 'select',
        name: 'panel.background.type',
        label: 'Panel background',
        width: 'half',
        help: 'Leave transparent to keep the default brand panel.',
        options: [
          { label: 'Transparent', value: 'none' },
          { label: 'Solid colour', value: 'solid' },
          { label: 'Gradient', value: 'gradient' },
          { label: 'Image', value: 'image' },
        ],
      },
      { kind: 'color', name: 'panel.background.color', label: 'Panel colour', width: 'half' },
      {
        kind: 'color',
        name: 'panel.background.gradientFrom',
        label: 'Gradient from',
        width: 'half',
      },
      { kind: 'color', name: 'panel.background.gradientTo', label: 'Gradient to', width: 'half' },
      {
        kind: 'number',
        name: 'panel.background.gradientAngle',
        label: 'Gradient angle',
        min: 0,
        max: 360,
        width: 'half',
      },
      {
        kind: 'media',
        name: 'panel.background.imageId',
        label: 'Panel background image',
        width: 'half',
      },
      {
        kind: 'select',
        name: 'panel.background.imagePosition',
        label: 'Image position',
        width: 'half',
        options: [
          { label: 'Centre', value: 'center' },
          { label: 'Top', value: 'top' },
          { label: 'Bottom', value: 'bottom' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      {
        kind: 'select',
        name: 'panel.background.imageSize',
        label: 'Image size',
        width: 'half',
        options: [
          { label: 'Cover', value: 'cover' },
          { label: 'Contain', value: 'contain' },
          { label: 'Original', value: 'auto' },
        ],
      },
      {
        kind: 'select',
        name: 'panel.background.imageRepeat',
        label: 'Image repeat',
        width: 'half',
        options: [
          { label: 'No repeat', value: 'no-repeat' },
          { label: 'Repeat', value: 'repeat' },
          { label: 'Repeat across', value: 'repeat-x' },
          { label: 'Repeat down', value: 'repeat-y' },
        ],
      },
      {
        kind: 'select',
        name: 'panel.background.imageAttachment',
        label: 'Image attachment',
        width: 'half',
        options: [
          { label: 'Scroll', value: 'scroll' },
          { label: 'Fixed', value: 'fixed' },
        ],
      },
      {
        kind: 'color',
        name: 'panel.background.overlayColor',
        label: 'Overlay colour',
        width: 'half',
      },
      {
        kind: 'number',
        name: 'panel.background.overlayOpacity',
        label: 'Overlay opacity (%)',
        min: 0,
        max: 100,
        width: 'half',
      },
      { kind: 'boolean', name: 'panel.borderEnabled', label: 'Panel border', width: 'half' },
      { kind: 'color', name: 'panel.borderColor', label: 'Border colour', width: 'half' },
      { kind: 'length', name: 'panel.borderWidth', label: 'Border width', width: 'half' },
      { kind: 'length', name: 'panel.radius', label: 'Corner radius', width: 'half' },
      {
        kind: 'select',
        name: 'panel.shadow',
        label: 'Panel shadow',
        width: 'half',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
          { label: 'Extra large', value: 'xl' },
        ],
      },
      { kind: 'length', name: 'panel.padding.top', label: 'Panel padding top', width: 'half' },
      {
        kind: 'length',
        name: 'panel.padding.bottom',
        label: 'Panel padding bottom',
        width: 'half',
      },
      { kind: 'length', name: 'panel.padding.left', label: 'Panel padding left', width: 'half' },
      { kind: 'length', name: 'panel.padding.right', label: 'Panel padding right', width: 'half' },
      { kind: 'color', name: 'panel.headingColor', label: 'Heading colour', width: 'half' },
      { kind: 'color', name: 'panel.textColor', label: 'Description colour', width: 'half' },
    ],
  },

  leadMagnet: {
    type: 'leadMagnet',
    label: 'Lead magnet',
    description: 'Offer a download or consultation in exchange for contact details.',
    group: 'Conversion',
    icon: 'gift',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: leadMagnetSchema,
    design: ['buttons'],
    formFields: formStyleGroups({ buttonLabel: 'ctaLabel' }),
    fields: [
      {
        kind: 'text',
        name: 'leadMagnetSlug',
        label: 'Lead magnet slug',
        help: 'From Marketing → Lead magnets',
      },
      { kind: 'text', name: 'heading', label: 'Heading override' },
      { kind: 'textarea', name: 'description', label: 'Description override', rows: 2 },
      { kind: 'media', name: 'imageId', label: 'Image override', width: 'half' },
      { kind: 'form', name: 'formSlug', label: 'Form override', width: 'half', help: FORM_PICKER_HELP },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        width: 'half',
        help: 'Optional. Names this placement on leads it captures, e.g. homepage_hero. Separate from UTM campaign tracking.',
      },
    ],
  },

  formBlock: {
    type: 'formBlock',
    label: 'Form',
    description: 'Embed any form built in Forms. Every submission creates a lead.',
    group: 'Conversion',
    icon: 'clipboard-list',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: formBlockSchema,
    design: ['buttons'],
    formFields: formStyleGroups(),
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'form', name: 'formSlug', label: 'Form', width: 'half', help: FORM_PICKER_HELP },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        width: 'half',
        help: 'Optional. Names this placement on leads it captures, e.g. homepage_hero. Separate from UTM campaign tracking.',
      },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Single column', value: 'single' },
          { label: 'Split with copy', value: 'split' },
        ],
      },
      { kind: 'text', name: 'sideHeading', label: 'Side heading' },
      {
        kind: 'repeater',
        name: 'sideBullets',
        label: 'Side bullets',
        itemLabel: 'Bullet',
        titleField: 'value',
        fields: [{ kind: 'text', name: 'value', label: 'Text' }],
      },
    ],
  },

  logoWall: {
    type: 'logoWall',
    label: 'Logo wall',
    description: 'Partner or customer logos. Falls back to text when no image is set.',
    group: 'Social proof',
    icon: 'building-2',
    surfaces: ['page', 'blogListing'],
    schema: logoWallSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      {
        kind: 'repeater',
        name: 'logos',
        label: 'Logos',
        itemLabel: 'Logo',
        titleField: 'label',
        fields: [
          { kind: 'text', name: 'label', label: 'Name', width: 'half' },
          { kind: 'url', name: 'url', label: 'Link', width: 'half' },
          { kind: 'media', name: 'imageId', label: 'Logo image' },
        ],
      },
    ],
  },

  stats: {
    type: 'stats',
    label: 'Statistics (classic)',
    description: 'A row of headline numbers. Superseded by the richer Statistics section.',
    group: 'Social proof',
    icon: 'trending-up',
    deprecated: true,
    supersededBy: 'statistics',
    surfaces: ['page', 'blogListing'],
    schema: statsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Statistics',
        itemLabel: 'Statistic',
        titleField: 'value',
        fields: [
          { kind: 'text', name: 'value', label: 'Value', width: 'half', placeholder: '99.9%' },
          { kind: 'text', name: 'label', label: 'Label', width: 'half' },
        ],
      },
    ],
  },

  steps: {
    type: 'steps',
    label: 'Steps / process',
    description: 'A numbered sequence describing how something works.',
    group: 'Content',
    icon: 'list-ordered',
    schema: stepsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Steps',
        itemLabel: 'Step',
        titleField: 'title',
        fields: [
          { kind: 'text', name: 'title', label: 'Title' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
        ],
      },
    ],
  },

  imageCards: {
    type: 'imageCards',
    label: 'Image cards',
    description: 'A responsive grid of picture cards with a heading, copy and a link.',
    group: 'Cards & media',
    icon: 'image',
    schema: imageCardsSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Cards per row', width: 'half', min: 1, max: 6 },
      ...responsiveColumnFields,
      {
        kind: 'number',
        name: 'maxRows',
        label: 'Maximum rows',
        width: 'half',
        min: 0,
        max: 20,
        help: '0 shows every card.',
      },
      {
        kind: 'select',
        name: 'imageRatio',
        label: 'Image ratio',
        width: 'half',
        options: RATIO_OPTIONS,
      },
      { kind: 'select', name: 'imageFit', label: 'Image fit', width: 'half', options: FIT_OPTIONS },
      {
        kind: 'select',
        name: 'cardAlign',
        label: 'Card alignment',
        width: 'half',
        options: ALIGN_OPTIONS,
      },
      {
        kind: 'select',
        name: 'cardStyle',
        label: 'Card design',
        width: 'half',
        options: [
          { label: 'Card', value: 'card' },
          { label: 'Plain', value: 'plain' },
          { label: 'Text over image', value: 'overlay' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Cards',
        itemLabel: 'Card',
        titleField: 'heading',
        fields: [
          { kind: 'media', name: 'imageId', label: 'Image' },
          {
            kind: 'text',
            name: 'imageAlt',
            label: 'Alt text',
            help: 'Describes the image for screen readers.',
          },
          { kind: 'text', name: 'heading', label: 'Heading' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
          ...linkFields('cta', 'Button'),
          { kind: 'url', name: 'linkUrl', label: 'Make the whole card a link', help: 'Optional.' },
        ],
      },
    ],
  },

  iconCards: {
    type: 'iconCards',
    label: 'Icon cards',
    description: 'A grid of icon-led cards. Use an icon from the library or upload your own.',
    group: 'Cards & media',
    icon: 'grid-3x3',
    schema: iconCardsSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Cards per row', width: 'half', min: 1, max: 6 },
      ...responsiveColumnFields,
      { kind: 'length', name: 'iconSize', label: 'Icon size', width: 'half', placeholder: '28px' },
      {
        kind: 'select',
        name: 'iconPosition',
        label: 'Icon position',
        width: 'half',
        options: [
          { label: 'Above the heading', value: 'top' },
          { label: 'Beside the text', value: 'left' },
        ],
      },
      {
        kind: 'select',
        name: 'iconStyle',
        label: 'Icon style',
        width: 'half',
        options: ICON_STYLE_OPTIONS,
      },
      {
        kind: 'select',
        name: 'cardAlign',
        label: 'Card alignment',
        width: 'half',
        options: ALIGN_OPTIONS,
      },
      {
        kind: 'select',
        name: 'cardStyle',
        label: 'Card design',
        width: 'half',
        options: [
          { label: 'Card', value: 'card' },
          { label: 'Plain', value: 'plain' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Cards',
        itemLabel: 'Card',
        titleField: 'heading',
        fields: [
          { kind: 'icon', name: 'icon', label: 'Icon', width: 'half' },
          { kind: 'media', name: 'imageId', label: 'Or upload an icon', width: 'half' },
          { kind: 'text', name: 'heading', label: 'Heading' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
          ...linkFields('cta', 'Button'),
          { kind: 'url', name: 'linkUrl', label: 'Make the whole card a link', help: 'Optional.' },
        ],
      },
    ],
  },

  imageBox: {
    type: 'imageBox',
    label: 'Image box',
    description: 'One image paired with a heading, copy and a button.',
    group: 'Cards & media',
    icon: 'layout-template',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: imageBoxSchema,
    design: ['buttons'],
    fields: [
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Image left', value: 'imageLeft' },
          { label: 'Image right', value: 'imageRight' },
          { label: 'Image on top', value: 'imageTop' },
          { label: 'Image as background', value: 'backgroundImage' },
        ],
      },
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'richtext', name: 'text', label: 'Text' },
      { kind: 'media', name: 'imageId', label: 'Image' },
      { kind: 'text', name: 'imageAlt', label: 'Alt text' },
      {
        kind: 'length',
        name: 'imageWidth',
        label: 'Image width',
        width: 'half',
        placeholder: '480px',
      },
      {
        kind: 'select',
        name: 'imageRatio',
        label: 'Image ratio',
        width: 'half',
        options: RATIO_OPTIONS,
      },
      { kind: 'select', name: 'imageFit', label: 'Image fit', width: 'half', options: FIT_OPTIONS },
      {
        kind: 'select',
        name: 'imagePosition',
        label: 'Image focal point',
        width: 'half',
        options: POSITION_OPTIONS,
      },
      ...linkFields('cta', 'Button'),
    ],
  },

  iconBox: {
    type: 'iconBox',
    label: 'Icon box',
    description: 'A single icon with a heading, description and optional button.',
    group: 'Cards & media',
    icon: 'shield',
    schema: iconBoxSchema,
    design: ['buttons'],
    fields: [
      { kind: 'icon', name: 'icon', label: 'Icon', width: 'half' },
      { kind: 'media', name: 'imageId', label: 'Or upload an icon', width: 'half' },
      { kind: 'length', name: 'iconSize', label: 'Icon size', width: 'half', placeholder: '32px' },
      {
        kind: 'select',
        name: 'iconStyle',
        label: 'Icon style',
        width: 'half',
        options: ICON_STYLE_OPTIONS,
      },
      {
        kind: 'select',
        name: 'iconAlign',
        label: 'Alignment',
        width: 'half',
        options: ALIGN_OPTIONS,
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 3 },
      ...linkFields('cta', 'Button'),
      { kind: 'url', name: 'linkUrl', label: 'Make the whole box a link', help: 'Optional.' },
    ],
  },

  listSection: {
    type: 'listSection',
    label: 'List',
    description: 'A heading with an unlimited, reorderable list of points.',
    group: 'Content',
    icon: 'list-ordered',
    schema: listSectionSchema,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 1, max: 4 },
      ...responsiveColumnFields,
      {
        kind: 'select',
        name: 'marker',
        label: 'Bullet style',
        width: 'half',
        options: MARKER_OPTIONS,
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'List items',
        itemLabel: 'Item',
        titleField: 'text',
        fields: [
          { kind: 'text', name: 'text', label: 'Text' },
          { kind: 'textarea', name: 'description', label: 'Supporting text', rows: 2 },
          {
            kind: 'icon',
            name: 'icon',
            label: 'Icon',
            width: 'half',
            help: 'Used when the bullet style is “Icon”.',
          },
          { kind: 'url', name: 'url', label: 'Link', width: 'half' },
        ],
      },
    ],
  },

  headingText: {
    type: 'headingText',
    label: 'Heading + text',
    description: 'A heading, subheading and formatted copy with an optional button.',
    group: 'Content',
    icon: 'text',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: headingTextSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'select', name: 'align', label: 'Alignment', width: 'half', options: ALIGN_OPTIONS },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'subheading', label: 'Subheading', rows: 2 },
      { kind: 'richtext', name: 'content', label: 'Text' },
      ...linkFields('cta', 'Button'),
    ],
  },

  textListImage: {
    type: 'textListImage',
    label: 'Text + list + image',
    description: 'Copy and a bullet list beside an image, with two calls to action.',
    group: 'Content',
    icon: 'image',
    schema: textListImageSchema,
    design: ['buttons'],
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      {
        kind: 'select',
        name: 'imagePlacement',
        label: 'Image placement',
        width: 'half',
        options: [
          { label: 'Image right', value: 'right' },
          { label: 'Image left', value: 'left' },
          { label: 'Image on top', value: 'top' },
          { label: 'Image underneath', value: 'bottom' },
        ],
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'subheading', label: 'Subheading', rows: 2 },
      { kind: 'richtext', name: 'description', label: 'Description' },
      {
        kind: 'select',
        name: 'marker',
        label: 'Bullet style',
        width: 'half',
        options: MARKER_OPTIONS,
      },
      {
        kind: 'select',
        name: 'imageRatio',
        label: 'Image ratio',
        width: 'half',
        options: RATIO_OPTIONS,
      },
      { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
      { kind: 'text', name: 'imageAlt', label: 'Alt text', width: 'half' },
      {
        kind: 'repeater',
        name: 'items',
        label: 'List items',
        itemLabel: 'Item',
        titleField: 'text',
        fields: [
          { kind: 'text', name: 'text', label: 'Text' },
          {
            kind: 'icon',
            name: 'icon',
            label: 'Icon',
            help: 'Used when the bullet style is “Icon”.',
          },
        ],
      },
      ...linkFields('primaryCta', 'Primary button'),
      ...linkFields('secondaryCta', 'Secondary button'),
    ],
  },

  statistics: {
    type: 'statistics',
    label: 'Statistics',
    description: 'Headline numbers such as “500+ Customers” or “99.9% Support SLA”.',
    group: 'Social proof',
    icon: 'trending-up',
    surfaces: ['page', 'blogListing'],
    schema: statisticsSchema,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'number',
        name: 'columns',
        label: 'Statistics per row',
        width: 'half',
        min: 1,
        max: 6,
      },
      ...responsiveColumnFields,
      { kind: 'select', name: 'align', label: 'Alignment', width: 'half', options: ALIGN_OPTIONS },
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Cards', value: 'card' },
          { label: 'Plain', value: 'plain' },
          { label: 'Separated by lines', value: 'divided' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Statistics',
        itemLabel: 'Statistic',
        titleField: 'label',
        fields: [
          { kind: 'text', name: 'prefix', label: 'Prefix', width: 'third', placeholder: '₹' },
          { kind: 'text', name: 'value', label: 'Number', width: 'third', placeholder: '500' },
          { kind: 'text', name: 'suffix', label: 'Suffix', width: 'third', placeholder: '+' },
          { kind: 'text', name: 'label', label: 'Label', placeholder: 'Customers' },
          { kind: 'textarea', name: 'description', label: 'Supporting text', rows: 2 },
          { kind: 'icon', name: 'icon', label: 'Icon', width: 'half' },
        ],
      },
    ],
  },

  productGrid: {
    type: 'productGrid',
    label: 'Product grid',
    description: 'Drop products onto any page — all, featured, hand-picked, by category or brand.',
    group: 'Products',
    icon: 'package',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: productGridSchema,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'select',
        name: 'source',
        label: 'Which products?',
        width: 'half',
        options: [
          { label: 'Featured products', value: 'featured' },
          { label: 'All published products', value: 'all' },
          { label: 'Hand-picked', value: 'selected' },
          { label: 'By category', value: 'category' },
          { label: 'By brand', value: 'brand' },
          { label: 'Latest products', value: 'latest' },
        ],
      },
      { kind: 'number', name: 'limit', label: 'Maximum products', width: 'half', min: 1, max: 24 },
      {
        kind: 'productCategory',
        name: 'categoryId',
        label: 'Category',
        width: 'half',
        showWhen: { field: 'source', equals: ['category'] },
      },
      {
        kind: 'brand',
        name: 'brandId',
        label: 'Brand',
        width: 'half',
        showWhen: { field: 'source', equals: ['brand'] },
      },
      {
        kind: 'products',
        name: 'productIds',
        label: 'Products',
        help: 'Drag to set the order they appear in.',
        showWhen: { field: 'source', equals: ['selected'] },
      },
      { kind: 'number', name: 'columns', label: 'Products per row', width: 'half', min: 1, max: 4 },
      ...responsiveColumnFields,
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Grid', value: 'grid' },
          { label: 'List', value: 'list' },
        ],
      },
      {
        kind: 'select',
        name: 'billing',
        label: 'Show price for',
        width: 'half',
        options: [
          { label: 'Monthly', value: 'monthly' },
          { label: 'Annual', value: 'annual' },
        ],
      },
      {
        kind: 'text',
        name: 'ctaLabel',
        label: 'Button label',
        width: 'half',
        placeholder: "The product's own label",
      },
      { kind: 'boolean', name: 'showImage', label: 'Show product image', width: 'half' },
      { kind: 'boolean', name: 'showDescription', label: 'Show description', width: 'half' },
      { kind: 'boolean', name: 'showPrice', label: 'Show pricing', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show feature list', width: 'half' },
      { kind: 'boolean', name: 'showBenefits', label: 'Show benefits', width: 'half' },
      { kind: 'boolean', name: 'showSpecs', label: 'Show specifications', width: 'half' },
      {
        kind: 'number',
        name: 'featureLimit',
        label: 'Maximum list items',
        width: 'half',
        min: 0,
        max: 40,
        help: 'Applies to features, benefits and specifications. 0 shows every one.',
      },
      { kind: 'boolean', name: 'showName', label: 'Show product name', width: 'half' },
      {
        kind: 'boolean',
        name: 'linkName',
        label: 'Product name links to the product',
        width: 'half',
        help: 'Off renders the name as plain text.',
      },
      {
        kind: 'boolean',
        name: 'showActions',
        label: 'Show all actions',
        width: 'half',
        help: 'Off hides the button and the details link together.',
      },
      { kind: 'boolean', name: 'showCta', label: 'Show primary button', width: 'half' },
      {
        kind: 'boolean',
        name: 'showDetailsLink',
        label: 'Show “View full details”',
        width: 'half',
      },
    ],
  },
};

export const BLOCKS: Record<string, BlockDefinition> = {
  ...PAGE_BLOCKS,
  ...SLIDER_BLOCKS,
  ...BLOG_BLOCKS,
  ...PRODUCT_BLOCKS,
};

export type BlockType = keyof typeof BLOCKS;

export const BLOCK_LIST = Object.values(BLOCKS);

/** What the "Add section" dialog offers — superseded blocks stay editable but hidden. */
export const BLOCK_PICKER_LIST = BLOCK_LIST.filter(
  (block) => !block.deprecated && (block.surfaces ?? ['page']).includes('page'),
);

/**
 * Blocks a given surface may add.
 *
 * The page picker is unchanged — a block without `surfaces` is a page block —
 * and each blog surface gets exactly the blocks written for it plus the generic
 * ones that opted in.
 *
 * A product page is the exception: it offers its own blocks *and* every page
 * block, without either having to list the other. That is what makes "the
 * sections I built for pages" available on a product, and it keeps being true
 * for blocks added later — neither list has to be maintained for the two to
 * stay in step.
 */
export function blocksForSurface(surface: BlockSurface): BlockDefinition[] {
  const inheritsPage = PAGE_BLOCK_SURFACES.includes(surface);
  return BLOCK_LIST.filter((block) => {
    if (block.deprecated) return false;
    const declared = block.surfaces ?? ['page'];
    return declared.includes(surface) || (inheritsPage && declared.includes('page'));
  });
}

/**
 * True when `blockType` may be placed on `surface`. Used by the actions.
 *
 * Deliberately the same answer the picker gives, superseded blocks included:
 * one that is hidden from the picker must not be addable by a hand-made
 * request either. An existing section of that type stays editable — that goes
 * through the block's schema, not through here.
 */
export function blockAllowedOnSurface(blockType: string, surface: BlockSurface): boolean {
  const block = BLOCKS[blockType];
  if (!block || block.deprecated) return false;
  const declared = block.surfaces ?? ['page'];
  return (
    declared.includes(surface) ||
    (PAGE_BLOCK_SURFACES.includes(surface) && declared.includes('page'))
  );
}

export function getBlock(type: string): BlockDefinition | null {
  return BLOCKS[type] ?? null;
}

/** Parses stored JSON with the block schema, falling back to defaults. */
export function parseBlockContent<T = Record<string, unknown>>(type: string, raw: unknown): T {
  const definition = getBlock(type);
  if (!definition) return (raw ?? {}) as T;
  const result = definition.schema.safeParse(raw ?? {});
  if (result.success) return result.data as T;
  // Partial data is common while editing — fall back to schema defaults.
  return definition.schema.parse({}) as T;
}

export function blockDefaults(type: string): Record<string, unknown> {
  const definition = getBlock(type);
  if (!definition) return {};
  return definition.schema.parse({}) as Record<string, unknown>;
}

export type HeroContent = z.infer<typeof heroSchema>;
export type RichTextContent = z.infer<typeof richTextSchema>;
export type FeatureGridContent = z.infer<typeof featureGridSchema>;
export type ImageContentContent = z.infer<typeof imageContentSchema>;
export type ProductCardsContent = z.infer<typeof productCardsSchema>;
export type ProductTableContent = z.infer<typeof productTableSchema>;
export type FaqContent = z.infer<typeof faqSchema>;
export type TestimonialsContent = z.infer<typeof testimonialsSchema>;
export type CtaContent = z.infer<typeof ctaSchema>;
export type LeadMagnetContent = z.infer<typeof leadMagnetSchema>;
export type FormBlockContent = z.infer<typeof formBlockSchema>;
export type LogoWallContent = z.infer<typeof logoWallSchema>;
export type StatsContent = z.infer<typeof statsSchema>;
export type StepsContent = z.infer<typeof stepsSchema>;
export type ImageCardsContent = z.infer<typeof imageCardsSchema>;
export type IconCardsContent = z.infer<typeof iconCardsSchema>;
export type ImageBoxContent = z.infer<typeof imageBoxSchema>;
export type IconBoxContent = z.infer<typeof iconBoxSchema>;
export type ListSectionContent = z.infer<typeof listSectionSchema>;
export type HeadingTextContent = z.infer<typeof headingTextSchema>;
export type TextListImageContent = z.infer<typeof textListImageSchema>;
export type StatisticsContent = z.infer<typeof statisticsSchema>;
export type ProductGridContent = z.infer<typeof productGridSchema>;
