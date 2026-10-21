import { z } from 'zod';
import type { FieldDescriptor } from './fields';
import type { BlockDefinition } from './block-types';
import { normaliseLength } from './design';
import { normaliseColor } from './color';
import { itemIdSchema, uniqueItemIds } from './item-id';
import { safePricingUrl } from './pricing-blocks';

/**
 * Product Showcase — a grid of clickable product tiles an administrator fills
 * with one button ("Add all products") and then edits freely.
 *
 * Each tile may be tied to a product. A tied tile follows the product: its
 * link is the product's page in the market being rendered, its image is the
 * product's image, and its name starts as the product's name — but every one
 * of those can be overridden on the tile, and a tile with no product is just a
 * name, an optional paragraph, an optional image and a link typed by hand.
 *
 * What the grid looks like — five styles, columns per breakpoint, borders,
 * radius, colours, hover — is the section's own content, so changing it never
 * needs code. Width, padding and background stay on the Design and Responsive
 * tabs, as for every section.
 */

export const MAX_SHOWCASE_ITEMS = 100;

export const SHOWCASE_STYLES = ['tile', 'card', 'list', 'chip', 'minimal'] as const;
export type ShowcaseStyle = (typeof SHOWCASE_STYLES)[number];

const SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
const WEIGHTS = ['400', '500', '600', '700', '800'] as const;
const HOVERS = ['lift', 'border', 'shadow', 'fill', 'none'] as const;

const color = z
  .string()
  .max(40)
  .catch('')
  .default('')
  .transform((v) => normaliseColor(v));
const length = z.preprocess(normaliseLength, z.string()).catch('').default('');
const text = (max: number) => z.string().max(max).catch('').default('');
const flag = (fallback: boolean) => z.boolean().catch(fallback).default(fallback);
const optionalId = z
  .string()
  .max(64)
  .nullable()
  .catch(null)
  .default(null)
  .transform((v) => (v && v.trim() ? v.trim() : null));
const url = z.string().max(500).catch('').default('').transform(safePricingUrl);

// --- items ------------------------------------------------------------------

export const showcaseItemSchema = z.object({
  id: itemIdSchema,
  /** The product this tile follows; null for a tile written entirely by hand. */
  productId: optionalId,
  /** Shown on the tile; blank uses the product's name. */
  name: text(160),
  /** An optional paragraph under the name. */
  description: text(600),
  /** Overrides the product's image; blank uses it. */
  imageId: optionalId,
  /** No image on this tile, even when the product has one. */
  hideImage: flag(false),
  /** Overrides the product's page; blank opens it. */
  url,
  newTab: flag(false),
  visible: flag(true),
  /** A small label in the corner — "New", "Popular". */
  badge: text(40),
  customStyle: flag(false),
  background: color,
  borderColor: color,
  textColor: color,
});

// --- section ----------------------------------------------------------------

export const productShowcaseSchema = z.object({
  showIntro: flag(true),
  eyebrow: text(80),
  heading: text(240),
  description: text(1200),
  align: z.enum(['left', 'center']).catch('center').default('center'),

  items: z
    .array(showcaseItemSchema)
    .max(MAX_SHOWCASE_ITEMS)
    .catch([])
    .default([])
    .transform(uniqueItemIds),

  /** A closing paragraph under the grid. */
  footnote: text(1200),

  // Display
  style: z.enum(SHOWCASE_STYLES).catch('tile').default('tile'),
  showImages: flag(true),
  showDescriptions: flag(true),
  showArrow: flag(true),
  textAlign: z.enum(['left', 'center']).catch('center').default('center'),
  imageSize: length,
  imageShape: z.enum(['rounded', 'square', 'circle']).catch('rounded').default('rounded'),
  imageFit: z.enum(['contain', 'cover']).catch('contain').default('contain'),

  // Layout
  columns: z.coerce.number().int().min(1).max(6).catch(5).default(5),
  tabletColumns: z.coerce.number().int().min(0).max(6).catch(0).default(0),
  mobileColumns: z.coerce.number().int().min(0).max(4).catch(0).default(0),
  columnGap: length,
  rowGap: length,
  gridMaxWidth: length,
  gridAlign: z.enum(['left', 'center', 'right']).catch('center').default('center'),
  equalHeight: flag(true),

  // Card style
  showCardStyle: flag(false),
  cardBackground: color,
  cardBorderColor: color,
  cardBorderWidth: length,
  cardRadius: length,
  cardPadding: length,
  cardMinHeight: length,
  cardShadow: z.enum(['', ...SHADOWS]).catch('').default(''),
  nameColor: color,
  nameSize: length,
  nameWeight: z.enum(['', ...WEIGHTS]).catch('').default(''),
  textColor: color,
  accentColor: color,
  badgeBg: color,
  badgeText: color,

  // Hover
  hoverEffect: z.enum(HOVERS).catch('lift').default('lift'),
  hoverBorderColor: color,
  hoverBackground: color,
  hoverTextColor: color,
});

export type ShowcaseItem = z.infer<typeof showcaseItemSchema>;
export type ProductShowcaseContent = z.infer<typeof productShowcaseSchema>;

// --- editor fields ----------------------------------------------------------

const when = (field: string, ...equals: Array<string | boolean>) => ({ field, equals: equals.length ? equals : [true] });

const ITEM_FIELDS: FieldDescriptor[] = [
  {
    kind: 'product',
    name: 'productId',
    label: 'Product (optional)',
    help: 'Tied to a product, the tile opens its page and shows its image unless you set your own below.',
  },
  { kind: 'text', name: 'name', label: 'Name', help: 'Blank uses the product’s name.' },
  { kind: 'textarea', name: 'description', label: 'Paragraph (optional)', rows: 2 },
  { kind: 'media', name: 'imageId', label: 'Image (optional)', width: 'half', help: 'Blank uses the product’s image.' },
  { kind: 'boolean', name: 'hideImage', label: 'No image on this tile', width: 'half', defaultValue: false },
  { kind: 'url', name: 'url', label: 'Link (optional)', width: 'half', placeholder: '/contact', help: 'Blank opens the product’s page.' },
  { kind: 'text', name: 'badge', label: 'Badge (optional)', width: 'half', placeholder: 'New' },
  { kind: 'boolean', name: 'newTab', label: 'Open in a new tab', width: 'half', defaultValue: false },
  { kind: 'boolean', name: 'visible', label: 'Show this tile', width: 'half', defaultValue: true },
  { kind: 'boolean', name: 'customStyle', label: 'Custom style for this tile', defaultValue: false },
  { kind: 'color', name: 'background', label: 'Background', width: 'third', showWhen: when('customStyle') },
  { kind: 'color', name: 'borderColor', label: 'Border colour', width: 'third', showWhen: when('customStyle') },
  { kind: 'color', name: 'textColor', label: 'Text colour', width: 'third', showWhen: when('customStyle') },
];

const shadowOptions = [
  { label: 'Style default', value: '' },
  { label: 'None', value: 'none' },
  { label: 'Subtle', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];

const SECTION_FIELDS: FieldDescriptor[] = [
  { kind: 'boolean', name: 'showIntro', label: 'Show heading and introduction', width: 'half' },
  {
    kind: 'select',
    name: 'align',
    label: 'Heading alignment',
    width: 'half',
    options: [
      { label: 'Centre', value: 'center' },
      { label: 'Left', value: 'left' },
    ],
  },
  { kind: 'text', name: 'eyebrow', label: 'Eyebrow (optional)', width: 'half', showWhen: when('showIntro') },
  { kind: 'text', name: 'heading', label: 'Heading (optional)', width: 'half', showWhen: when('showIntro') },
  { kind: 'textarea', name: 'description', label: 'Introduction paragraph (optional)', rows: 3, showWhen: when('showIntro') },

  {
    kind: 'repeater',
    name: 'items',
    label: 'Tiles',
    help: 'Press “Add all products” to fill the grid in one go, then rename, reorder, hide or restyle any tile. Tiles can also be written by hand.',
    itemLabel: 'Tile',
    titleField: 'name',
    max: MAX_SHOWCASE_ITEMS,
    identity: true,
    importer: 'products',
    fields: ITEM_FIELDS,
  },
  { kind: 'textarea', name: 'footnote', label: 'Paragraph under the grid (optional)', rows: 2 },

  // Display
  {
    kind: 'select',
    name: 'style',
    label: 'Tile style',
    width: 'half',
    options: [
      { label: 'Tile — centred box', value: 'tile' },
      { label: 'Card — image on top', value: 'card' },
      { label: 'List — image beside the name', value: 'list' },
      { label: 'Chip — compact pill', value: 'chip' },
      { label: 'Minimal — text link', value: 'minimal' },
    ],
  },
  {
    kind: 'select',
    name: 'textAlign',
    label: 'Text alignment',
    width: 'half',
    options: [
      { label: 'Centre', value: 'center' },
      { label: 'Left', value: 'left' },
    ],
  },
  { kind: 'boolean', name: 'showImages', label: 'Show images', width: 'third' },
  { kind: 'boolean', name: 'showDescriptions', label: 'Show paragraphs', width: 'third' },
  { kind: 'boolean', name: 'showArrow', label: 'Show an arrow on links', width: 'third' },
  { kind: 'length', name: 'imageSize', label: 'Image size', width: 'third', placeholder: '56px', showWhen: when('showImages') },
  {
    kind: 'select',
    name: 'imageShape',
    label: 'Image shape',
    width: 'third',
    showWhen: when('showImages'),
    options: [
      { label: 'Rounded', value: 'rounded' },
      { label: 'Square', value: 'square' },
      { label: 'Circle', value: 'circle' },
    ],
  },
  {
    kind: 'select',
    name: 'imageFit',
    label: 'Image fit',
    width: 'third',
    showWhen: when('showImages'),
    options: [
      { label: 'Whole image (contain)', value: 'contain' },
      { label: 'Fill the box (cover)', value: 'cover' },
    ],
  },

  // Layout
  { kind: 'number', name: 'columns', label: 'Tiles per row (desktop)', width: 'third', min: 1, max: 6 },
  { kind: 'number', name: 'tabletColumns', label: 'Per row on tablet', width: 'third', min: 0, max: 6, help: '0 picks for you (up to 3).' },
  { kind: 'number', name: 'mobileColumns', label: 'Per row on mobile', width: 'third', min: 0, max: 4, help: '0 picks for you: two small tiles, or one card or list row.' },
  { kind: 'length', name: 'columnGap', label: 'Column gap', width: 'third', placeholder: '20px' },
  { kind: 'length', name: 'rowGap', label: 'Row gap', width: 'third', placeholder: '20px' },
  { kind: 'boolean', name: 'equalHeight', label: 'Equal-height tiles', width: 'third' },
  { kind: 'length', name: 'gridMaxWidth', label: 'Grid width', width: 'half', placeholder: '1200px', help: 'Blank fills the section width.' },
  {
    kind: 'select',
    name: 'gridAlign',
    label: 'Grid alignment',
    width: 'half',
    options: [
      { label: 'Centre', value: 'center' },
      { label: 'Left', value: 'left' },
      { label: 'Right', value: 'right' },
    ],
  },

  // Card style
  { kind: 'boolean', name: 'showCardStyle', label: 'Tile design (border, colours, size)' },
  { kind: 'color', name: 'cardBackground', label: 'Background', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'cardBorderColor', label: 'Border colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardBorderWidth', label: 'Border thickness', width: 'third', placeholder: '1px', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardRadius', label: 'Corner radius', width: 'third', placeholder: '14px', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardPadding', label: 'Padding', width: 'third', placeholder: '20px', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardMinHeight', label: 'Minimum height', width: 'third', placeholder: '96px', showWhen: when('showCardStyle') },
  { kind: 'select', name: 'cardShadow', label: 'Shadow', width: 'third', options: shadowOptions, showWhen: when('showCardStyle') },
  { kind: 'color', name: 'nameColor', label: 'Name colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'nameSize', label: 'Name size', width: 'third', placeholder: '18px', showWhen: when('showCardStyle') },
  {
    kind: 'select',
    name: 'nameWeight',
    label: 'Name weight',
    width: 'third',
    showWhen: when('showCardStyle'),
    options: [
      { label: 'Style default', value: '' },
      { label: 'Regular', value: '400' },
      { label: 'Medium', value: '500' },
      { label: 'Semibold', value: '600' },
      { label: 'Bold', value: '700' },
      { label: 'Extra bold', value: '800' },
    ],
  },
  { kind: 'color', name: 'textColor', label: 'Paragraph colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'accentColor', label: 'Accent (arrow, hover)', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'badgeBg', label: 'Badge background', width: 'half', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'badgeText', label: 'Badge text', width: 'half', showWhen: when('showCardStyle') },

  // Hover
  {
    kind: 'select',
    name: 'hoverEffect',
    label: 'Hover effect',
    width: 'half',
    options: [
      { label: 'Lift', value: 'lift' },
      { label: 'Coloured border', value: 'border' },
      { label: 'Shadow', value: 'shadow' },
      { label: 'Fill with accent', value: 'fill' },
      { label: 'None', value: 'none' },
    ],
  },
  { kind: 'color', name: 'hoverBorderColor', label: 'Hover border', width: 'half', showWhen: when('hoverEffect', 'lift', 'border', 'shadow') },
  { kind: 'color', name: 'hoverBackground', label: 'Hover background', width: 'half', showWhen: when('hoverEffect', 'fill') },
  { kind: 'color', name: 'hoverTextColor', label: 'Hover text', width: 'half', showWhen: when('hoverEffect', 'fill') },
];

export const SHOWCASE_BLOCKS: Record<string, BlockDefinition> = {
  productShowcase: {
    type: 'productShowcase',
    label: 'Product Showcase',
    description:
      'A grid of clickable tiles — add every product in one click, then rename, add a paragraph, choose images and style the grid.',
    group: 'Products',
    icon: 'grid-3x3',
    schema: productShowcaseSchema,
    fields: SECTION_FIELDS,
  },
};
