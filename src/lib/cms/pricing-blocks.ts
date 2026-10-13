import { z } from 'zod';
import type { FieldDescriptor } from './fields';
import type { BlockDefinition } from './block-types';
import { normaliseLength } from './design';
import { normaliseColor } from './color';
import { itemIdSchema, uniqueItemIds } from './item-id';

/**
 * Manual Pricing Comparison — pricing cards written entirely in the CMS.
 *
 * Unlike the product blocks, nothing here reads the catalogue: every plan name,
 * price, feature and button is typed into the section and stored in its
 * `content` JSON by the ordinary section save. The section's width, padding,
 * background and per-breakpoint columns come from the Design and Responsive
 * tabs, as for every other section; what is here is what only a pricing table
 * has — plans, features, buttons and highlights.
 *
 * Defaults reproduce the reference: white cards with a hairline grey border,
 * rounded corners, pale pink buttons with red text, and a red border with a
 * pale pink badge on a highlighted plan. Every one of them is editable.
 */

export const MAX_PRICING_PLANS = 12;
export const MAX_PLAN_FEATURES = 30;

const color = z
  .string()
  .max(40)
  .catch('')
  .default('')
  .transform((v) => normaliseColor(v));
const colorWithDefault = (fallback: string) =>
  z
    .string()
    .max(40)
    .catch(fallback)
    .default(fallback)
    .transform((v) => normaliseColor(v) || (v === '' ? '' : fallback));
const length = z.preprocess(normaliseLength, z.string()).catch('').default('');
const lengthWithDefault = (fallback: string) =>
  z.preprocess((v) => (v === undefined ? fallback : normaliseLength(v)), z.string()).catch(fallback);
const text = (max: number) => z.string().max(max).catch('').default('');
const flag = (fallback: boolean) => z.boolean().catch(fallback).default(fallback);

/**
 * A link a visitor may follow: a site path, an anchor, a query, mailto:/tel:
 * or http(s). Anything else — javascript:, data:, a typo — is dropped here,
 * and the renderer checks again with `safeUrl` before writing an href.
 */
export function safePricingUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim().slice(0, 500);
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#') || value.startsWith('?')) return value;
  if (/^(mailto|tel):[^\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}
const url = z.string().max(500).catch('').default('').transform(safePricingUrl);

const SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
const ALIGN_SELF = ['inherit', 'stretch', 'start', 'center', 'end'] as const;
const WEIGHTS = ['400', '500', '600', '700', '800'] as const;
const EMPHASIS = ['normal', 'medium', 'bold', 'italic'] as const;

// --- features ---------------------------------------------------------------

export const pricingFeatureSchema = z.object({
  id: itemIdSchema,
  text: text(300),
  /** Optional shared row label, for comparing the same row across plans. */
  rowLabel: text(80),
  showCheck: flag(true),
  emphasis: z.enum(EMPHASIS).catch('normal').default('normal'),
  visible: flag(true),
  customStyle: flag(false),
  color,
  background: color,
  padding: length,
});

// --- plans ------------------------------------------------------------------

/** Button settings a plan may override; empty means "use the section's". */
const planButtonOverrides = {
  buttonBg: color,
  buttonText: color,
  buttonBorder: color,
  buttonHoverBg: color,
  buttonHoverText: color,
  buttonRadius: length,
  buttonFontSize: length,
  buttonFontWeight: z.enum(['', ...WEIGHTS]).catch('').default(''),
  buttonWidth: z.enum(['', 'auto', 'full']).catch('').default(''),
  buttonAlign: z.enum(['', 'left', 'center', 'right']).catch('').default(''),
  buttonPadding: length,
};

export const pricingPlanSchema = z.object({
  id: itemIdSchema,
  name: text(160),
  description: text(800),
  price: text(80),
  billing: text(160),
  badge: text(60),
  features: z
    .array(pricingFeatureSchema)
    .max(MAX_PLAN_FEATURES)
    .catch([])
    .default([])
    .transform(uniqueItemIds),

  // Button
  showCta: flag(true),
  ctaLabel: text(60),
  ctaUrl: url,
  newTab: flag(false),
  customButton: flag(false),
  ...planButtonOverrides,

  // Highlight
  highlight: flag(false),
  highlightBorderColor: color,
  highlightBorderWidth: length,
  highlightBackground: color,
  highlightShadow: z.enum(['', ...SHADOWS]).catch('').default(''),
  /** Desktop only: lifts or enlarges the card a little. */
  highlightScale: z.coerce.number().min(1).max(1.1).catch(1).default(1),
  highlightOffset: length,
  badgeBg: color,
  badgeText: color,

  // Card
  visible: flag(true),
  /** CSS order; 0 keeps the card where it sits in the list. */
  order: z.coerce.number().int().min(0).max(99).catch(0).default(0),
  /** Columns the card spans when columns are not forced equal. */
  span: z.coerce.number().int().min(1).max(4).catch(1).default(1),
  maxWidth: length,
  verticalAlign: z.enum(ALIGN_SELF).catch('inherit').default('inherit'),
  customStyle: flag(false),
  background: color,
  borderColor: color,
  textColor: color,
  headingColor: color,
  padding: length,
  radius: length,
  shadow: z.enum(['', ...SHADOWS]).catch('').default(''),
});

// --- section ----------------------------------------------------------------

export const manualPricingTableSchema = z.object({
  heading: text(240),
  description: text(1200),
  showIntro: flag(true),
  align: z.enum(['left', 'center']).catch('center').default('center'),

  plans: z
    .array(pricingPlanSchema)
    .max(MAX_PRICING_PLANS)
    .catch([])
    .default([])
    .transform(uniqueItemIds),

  // Layout
  showLayoutOptions: flag(false),
  columns: z.coerce.number().int().min(1).max(6).catch(3).default(3),
  tabletColumns: z.coerce.number().int().min(0).max(6).catch(0).default(0),
  mobileColumns: z.coerce.number().int().min(0).max(6).catch(0).default(0),
  equalWidth: flag(true),
  columnGap: length,
  rowGap: length,
  cardAlign: z.enum(['stretch', 'start', 'center', 'end']).catch('stretch').default('stretch'),
  cardHeight: z.enum(['equal', 'auto']).catch('equal').default('equal'),
  featureSpacing: length,
  gridMaxWidth: length,
  gridAlign: z.enum(['left', 'center', 'right']).catch('center').default('center'),
  /** Lines features up by their row label across plans. */
  compareRows: flag(false),

  // Card defaults
  showCardStyle: flag(false),
  cardBackground: colorWithDefault('#FFFFFF'),
  cardBorderColor: colorWithDefault('#E5E7EB'),
  cardBorderWidth: lengthWithDefault('1px'),
  cardRadius: lengthWithDefault('12px'),
  cardPadding: lengthWithDefault('24px'),
  cardShadow: z.enum(SHADOWS).catch('sm').default('sm'),
  headingColor: color,
  textColor: color,
  checkColor: color,
  showSeparator: flag(true),
  separatorColor: colorWithDefault('#E5E7EB'),

  // Button defaults
  showButtonStyle: flag(false),
  buttonBg: colorWithDefault('#FFE1E1'),
  buttonText: colorWithDefault('#E1251B'),
  buttonBorder: color,
  buttonHoverBg: colorWithDefault('#FFD0D0'),
  buttonHoverText: color,
  buttonRadius: lengthWithDefault('6px'),
  buttonFontSize: lengthWithDefault('13px'),
  buttonFontWeight: z.enum(WEIGHTS).catch('700').default('700'),
  buttonUppercase: flag(true),
  buttonWidth: z.enum(['auto', 'full']).catch('full').default('full'),
  buttonAlign: z.enum(['left', 'center', 'right']).catch('center').default('center'),
  buttonPadding: lengthWithDefault('10px'),
  /** Where the button sits when cards are equal height. */
  buttonPlacement: z.enum(['bottom', 'afterFeatures']).catch('bottom').default('bottom'),

  // Highlight defaults
  highlightBorderColor: colorWithDefault('#E1251B'),
  highlightBorderWidth: lengthWithDefault('1.5px'),
  badgeBg: colorWithDefault('#FFE1E1'),
  badgeText: colorWithDefault('#C81E1E'),
});

export type PricingFeature = z.infer<typeof pricingFeatureSchema>;
export type PricingPlan = z.infer<typeof pricingPlanSchema>;
export type ManualPricingTableContent = z.infer<typeof manualPricingTableSchema>;

// --- editor fields ----------------------------------------------------------

const shadowOptions = (inherit?: string) => [
  ...(inherit ? [{ label: inherit, value: '' }] : []),
  { label: 'None', value: 'none' },
  { label: 'Subtle', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];
const weightOptions = [
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semibold', value: '600' },
  { label: 'Bold', value: '700' },
  { label: 'Extra bold', value: '800' },
];

const FEATURE_FIELDS: FieldDescriptor[] = [
  { kind: 'text', name: 'text', label: 'Feature text' },
  { kind: 'boolean', name: 'visible', label: 'Show this row', width: 'half', defaultValue: true },
  { kind: 'boolean', name: 'showCheck', label: 'Show checkmark', width: 'half', defaultValue: true },
  {
    kind: 'select',
    name: 'emphasis',
    label: 'Emphasis',
    width: 'half',
    defaultValue: 'normal',
    options: [
      { label: 'Normal', value: 'normal' },
      { label: 'Medium', value: 'medium' },
      { label: 'Bold', value: 'bold' },
      { label: 'Italic', value: 'italic' },
    ],
  },
  {
    kind: 'text',
    name: 'rowLabel',
    label: 'Row label (optional)',
    width: 'half',
    help: 'With “Line up rows” on, rows with the same label share a line across plans.',
  },
  { kind: 'boolean', name: 'customStyle', label: 'Custom row style', defaultValue: false },
  { kind: 'color', name: 'color', label: 'Text colour', width: 'third', showWhen: { field: 'customStyle', equals: [true] } },
  { kind: 'color', name: 'background', label: 'Row background', width: 'third', showWhen: { field: 'customStyle', equals: [true] } },
  { kind: 'length', name: 'padding', label: 'Row padding', width: 'third', placeholder: '4px', showWhen: { field: 'customStyle', equals: [true] } },
];

const PLAN_FIELDS: FieldDescriptor[] = [
  { kind: 'text', name: 'name', label: 'Plan name' },
  { kind: 'textarea', name: 'description', label: 'Short description', rows: 2 },
  { kind: 'text', name: 'price', label: 'Price (optional)', width: 'half', placeholder: '₹1,999' },
  { kind: 'text', name: 'billing', label: 'Billing information (optional)', width: 'half', placeholder: 'per user / month' },
  { kind: 'text', name: 'badge', label: 'Badge (optional)', width: 'half', placeholder: 'Most popular' },
  { kind: 'boolean', name: 'visible', label: 'Show this plan', width: 'half', defaultValue: true },
  {
    kind: 'repeater',
    name: 'features',
    label: 'Features',
    itemLabel: 'Feature',
    titleField: 'text',
    max: MAX_PLAN_FEATURES,
    identity: true,
    fields: FEATURE_FIELDS,
  },

  // Button
  { kind: 'boolean', name: 'showCta', label: 'Show button', width: 'half', defaultValue: true },
  { kind: 'boolean', name: 'newTab', label: 'Open in a new tab', width: 'half', defaultValue: false },
  { kind: 'text', name: 'ctaLabel', label: 'Button text', width: 'half', placeholder: 'Request quote' },
  { kind: 'url', name: 'ctaUrl', label: 'Button link', width: 'half', placeholder: '/contact' },
  { kind: 'boolean', name: 'customButton', label: 'Custom button style for this plan', defaultValue: false },
  ...(
    [
      { kind: 'color', name: 'buttonBg', label: 'Button background', width: 'third' },
      { kind: 'color', name: 'buttonText', label: 'Button text', width: 'third' },
      { kind: 'color', name: 'buttonBorder', label: 'Button border', width: 'third' },
      { kind: 'color', name: 'buttonHoverBg', label: 'Hover background', width: 'third' },
      { kind: 'color', name: 'buttonHoverText', label: 'Hover text', width: 'third' },
      { kind: 'length', name: 'buttonRadius', label: 'Button radius', width: 'third' },
      { kind: 'length', name: 'buttonFontSize', label: 'Font size', width: 'third' },
      {
        kind: 'select',
        name: 'buttonFontWeight',
        label: 'Font weight',
        width: 'third',
        options: [{ label: 'Section default', value: '' }, ...weightOptions],
      },
      { kind: 'length', name: 'buttonPadding', label: 'Button padding', width: 'third' },
      {
        kind: 'select',
        name: 'buttonWidth',
        label: 'Button width',
        width: 'half',
        options: [
          { label: 'Section default', value: '' },
          { label: 'Full width', value: 'full' },
          { label: 'Fit text', value: 'auto' },
        ],
      },
      {
        kind: 'select',
        name: 'buttonAlign',
        label: 'Button alignment',
        width: 'half',
        options: [
          { label: 'Section default', value: '' },
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
    ] as FieldDescriptor[]
  ).map((field) => ({ ...field, showWhen: { field: 'customButton', equals: [true] } }) as FieldDescriptor),

  // Highlight
  { kind: 'boolean', name: 'highlight', label: 'Highlight this plan', defaultValue: false },
  ...(
    [
      { kind: 'color', name: 'highlightBorderColor', label: 'Border colour', width: 'third' },
      { kind: 'length', name: 'highlightBorderWidth', label: 'Border thickness', width: 'third' },
      { kind: 'color', name: 'highlightBackground', label: 'Background', width: 'third' },
      { kind: 'select', name: 'highlightShadow', label: 'Shadow', width: 'third', options: shadowOptions('Card default') },
      { kind: 'color', name: 'badgeBg', label: 'Badge background', width: 'third' },
      { kind: 'color', name: 'badgeText', label: 'Badge text', width: 'third' },
      {
        kind: 'select',
        name: 'highlightScale',
        label: 'Enlarge on desktop',
        width: 'half',
        options: [
          { label: 'No', value: '1' },
          { label: 'Slightly (2%)', value: '1.02' },
          { label: 'More (4%)', value: '1.04' },
        ],
      },
      { kind: 'length', name: 'highlightOffset', label: 'Raise on desktop', width: 'half', placeholder: '-8px', help: 'A negative value lifts the card.' },
    ] as FieldDescriptor[]
  ).map((field) => ({ ...field, showWhen: { field: 'highlight', equals: [true] } }) as FieldDescriptor),

  // Card
  { kind: 'boolean', name: 'customStyle', label: 'Custom card layout and style', defaultValue: false },
  ...(
    [
      { kind: 'number', name: 'order', label: 'Display order', width: 'third', min: 0, max: 99, help: '0 keeps its place in the list.' },
      { kind: 'number', name: 'span', label: 'Columns it spans', width: 'third', min: 1, max: 4, help: 'When equal widths are off.' },
      { kind: 'length', name: 'maxWidth', label: 'Maximum width', width: 'third', placeholder: '360px' },
      {
        kind: 'select',
        name: 'verticalAlign',
        label: 'Vertical alignment',
        width: 'half',
        options: [
          { label: 'Section default', value: 'inherit' },
          { label: 'Stretch', value: 'stretch' },
          { label: 'Top', value: 'start' },
          { label: 'Middle', value: 'center' },
          { label: 'Bottom', value: 'end' },
        ],
      },
      { kind: 'select', name: 'shadow', label: 'Shadow', width: 'half', options: shadowOptions('Section default') },
      { kind: 'color', name: 'background', label: 'Background', width: 'third' },
      { kind: 'color', name: 'borderColor', label: 'Border colour', width: 'third' },
      { kind: 'color', name: 'textColor', label: 'Text colour', width: 'third' },
      { kind: 'color', name: 'headingColor', label: 'Heading colour', width: 'third' },
      { kind: 'length', name: 'padding', label: 'Padding', width: 'third' },
      { kind: 'length', name: 'radius', label: 'Corner radius', width: 'third' },
    ] as FieldDescriptor[]
  ).map((field) => ({ ...field, showWhen: { field: 'customStyle', equals: [true] } }) as FieldDescriptor),
];

const when = (field: string) => ({ field, equals: [true] });

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
  { kind: 'text', name: 'heading', label: 'Heading (optional)', showWhen: when('showIntro') },
  { kind: 'textarea', name: 'description', label: 'Subtitle (optional)', rows: 2, showWhen: when('showIntro') },

  {
    kind: 'repeater',
    name: 'plans',
    label: 'Plans',
    help: 'Each card is written here — nothing is read from products. Plans may have different numbers of features.',
    itemLabel: 'Plan',
    titleField: 'name',
    max: MAX_PRICING_PLANS,
    identity: true,
    fields: PLAN_FIELDS,
  },

  // Layout
  { kind: 'boolean', name: 'showLayoutOptions', label: 'Layout options' },
  { kind: 'number', name: 'columns', label: 'Plans per row (desktop)', width: 'third', min: 1, max: 6, showWhen: when('showLayoutOptions') },
  { kind: 'number', name: 'tabletColumns', label: 'Per row on tablet', width: 'third', min: 0, max: 6, help: '0 narrows it for you.', showWhen: when('showLayoutOptions') },
  { kind: 'number', name: 'mobileColumns', label: 'Per row on mobile', width: 'third', min: 0, max: 6, help: '0 = one per row.', showWhen: when('showLayoutOptions') },
  { kind: 'boolean', name: 'equalWidth', label: 'Equal-width columns', width: 'half', showWhen: when('showLayoutOptions') },
  {
    kind: 'select',
    name: 'cardHeight',
    label: 'Card height',
    width: 'half',
    showWhen: when('showLayoutOptions'),
    options: [
      { label: 'Equal height', value: 'equal' },
      { label: 'Fit content', value: 'auto' },
    ],
  },
  {
    kind: 'select',
    name: 'cardAlign',
    label: 'Card alignment (fit content)',
    width: 'half',
    showWhen: when('showLayoutOptions'),
    options: [
      { label: 'Stretch', value: 'stretch' },
      { label: 'Top', value: 'start' },
      { label: 'Middle', value: 'center' },
      { label: 'Bottom', value: 'end' },
    ],
  },
  {
    kind: 'select',
    name: 'buttonPlacement',
    label: 'Button placement',
    width: 'half',
    showWhen: when('showLayoutOptions'),
    options: [
      { label: 'Bottom of the card', value: 'bottom' },
      { label: 'Straight after the features', value: 'afterFeatures' },
    ],
  },
  { kind: 'length', name: 'columnGap', label: 'Column gap', width: 'third', placeholder: '24px', showWhen: when('showLayoutOptions') },
  { kind: 'length', name: 'rowGap', label: 'Row gap', width: 'third', placeholder: '24px', showWhen: when('showLayoutOptions') },
  { kind: 'length', name: 'featureSpacing', label: 'Feature spacing', width: 'third', placeholder: '10px', showWhen: when('showLayoutOptions') },
  { kind: 'length', name: 'gridMaxWidth', label: 'Card area width', width: 'half', placeholder: '1200px', help: 'Blank fills the section width.', showWhen: when('showLayoutOptions') },
  {
    kind: 'select',
    name: 'gridAlign',
    label: 'Card area alignment',
    width: 'half',
    showWhen: when('showLayoutOptions'),
    options: [
      { label: 'Centre', value: 'center' },
      { label: 'Left', value: 'left' },
      { label: 'Right', value: 'right' },
    ],
  },
  { kind: 'boolean', name: 'compareRows', label: 'Line up rows by their row label', showWhen: when('showLayoutOptions') },

  // Card style
  { kind: 'boolean', name: 'showCardStyle', label: 'Card style' },
  { kind: 'color', name: 'cardBackground', label: 'Card background', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'cardBorderColor', label: 'Border colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardBorderWidth', label: 'Border thickness', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardRadius', label: 'Corner radius', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'cardPadding', label: 'Padding', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'select', name: 'cardShadow', label: 'Shadow', width: 'third', options: shadowOptions(), showWhen: when('showCardStyle') },
  { kind: 'color', name: 'headingColor', label: 'Plan name colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'textColor', label: 'Text colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'checkColor', label: 'Checkmark colour', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'boolean', name: 'showSeparator', label: 'Line under the description', width: 'half', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'separatorColor', label: 'Line colour', width: 'half', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'highlightBorderColor', label: 'Highlighted border', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'length', name: 'highlightBorderWidth', label: 'Highlighted thickness', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'badgeBg', label: 'Badge background', width: 'third', showWhen: when('showCardStyle') },
  { kind: 'color', name: 'badgeText', label: 'Badge text', width: 'third', showWhen: when('showCardStyle') },

  // Button style
  { kind: 'boolean', name: 'showButtonStyle', label: 'Button style' },
  { kind: 'color', name: 'buttonBg', label: 'Background', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'color', name: 'buttonText', label: 'Text', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'color', name: 'buttonBorder', label: 'Border', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'color', name: 'buttonHoverBg', label: 'Hover background', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'color', name: 'buttonHoverText', label: 'Hover text', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'length', name: 'buttonRadius', label: 'Radius', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'length', name: 'buttonFontSize', label: 'Font size', width: 'third', showWhen: when('showButtonStyle') },
  { kind: 'select', name: 'buttonFontWeight', label: 'Font weight', width: 'third', options: weightOptions, showWhen: when('showButtonStyle') },
  { kind: 'length', name: 'buttonPadding', label: 'Vertical padding', width: 'third', showWhen: when('showButtonStyle') },
  {
    kind: 'select',
    name: 'buttonWidth',
    label: 'Width',
    width: 'third',
    showWhen: when('showButtonStyle'),
    options: [
      { label: 'Full width', value: 'full' },
      { label: 'Fit text', value: 'auto' },
    ],
  },
  {
    kind: 'select',
    name: 'buttonAlign',
    label: 'Alignment',
    width: 'third',
    showWhen: when('showButtonStyle'),
    options: [
      { label: 'Centre', value: 'center' },
      { label: 'Left', value: 'left' },
      { label: 'Right', value: 'right' },
    ],
  },
  { kind: 'boolean', name: 'buttonUppercase', label: 'Uppercase', width: 'third', showWhen: when('showButtonStyle') },
];

export const PRICING_BLOCKS: Record<string, BlockDefinition> = {
  manualPricingTable: {
    type: 'manualPricingTable',
    label: 'Manual Pricing Comparison',
    description: 'Pricing cards written by hand — plans, features and buttons, with any plan highlighted. No products needed.',
    group: 'Content',
    icon: 'table',
    schema: manualPricingTableSchema,
    fields: SECTION_FIELDS,
  },
};
