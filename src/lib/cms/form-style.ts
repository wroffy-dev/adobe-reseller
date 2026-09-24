import { z } from 'zod';
import type * as React from 'react';
import { normaliseColor } from './color';
import { normaliseLength } from './design';
import type { FieldDescriptor } from './fields';
import type { FormDesign } from '@/lib/forms/form-design';

/**
 * One placement of a form, restyled.
 *
 * A form's design lives in Forms and is shared by every page that uses it. A
 * section that embeds a form stores this beside its content, as
 * `content.formStyle`, and it is laid over the form's design for that one
 * placement only — the form and every other page using it are untouched.
 *
 * Every value is blank by default and blank changes nothing, so a section
 * saved before this existed renders its form exactly as it did.
 */

const color = z
  .string()
  .max(40)
  .transform((value) => normaliseColor(value))
  .catch('')
  .default('');

const length = z
  .string()
  .max(16)
  .transform((value) => normaliseLength(value))
  .catch('')
  .default('');

const text = (max: number) => z.string().max(max).catch('').default('');

export const FORM_ALIGNS = ['inherit', 'left', 'center', 'right'] as const;
export const FORM_BUTTON_ALIGNS = ['inherit', 'left', 'center', 'right', 'full'] as const;
export const FORM_CARD_SHADOWS = ['inherit', 'none', 'sm', 'md', 'lg'] as const;

export const formStyleSchema = z.object({
  // Heading
  heading: text(160),
  description: text(400),
  headingAlign: z.enum(FORM_ALIGNS).catch('inherit').default('inherit'),
  headingColor: color,
  headingSize: length,
  descriptionColor: color,

  // Text and fields
  labelColor: color,
  inputTextColor: color,
  helpColor: color,
  inputBackground: color,
  inputBorderColor: color,
  inputRadius: length,

  // Button
  buttonLabel: text(60),
  buttonAlign: z.enum(FORM_BUTTON_ALIGNS).catch('inherit').default('inherit'),
  buttonBackground: color,
  buttonTextColor: color,
  buttonHoverBackground: color,
  buttonHoverTextColor: color,
  buttonRadius: length,

  // Card
  cardBackground: color,
  cardBorderColor: color,
  cardRadius: length,
  cardPadding: length,
  cardShadow: z.enum(FORM_CARD_SHADOWS).catch('inherit').default('inherit'),
  /** Blank fills the column; a length makes the card narrower than it. */
  cardWidth: length,
  /** Where a narrower card sits in its column. */
  cardPosition: z.enum(['center', 'left', 'right']).catch('center').default('center'),
});

export type FormStyle = z.infer<typeof formStyleSchema>;

export const DEFAULT_FORM_STYLE: FormStyle = formStyleSchema.parse({});

/** The block-schema field. A stored value that no longer parses falls back to blank. */
export const formStyleField = formStyleSchema.catch(() => DEFAULT_FORM_STYLE).default(DEFAULT_FORM_STYLE);

/**
 * The form's design with this placement's choices laid over it.
 *
 * Returns a copy — the design comes from a cached form shared with every other
 * placement, so it is never mutated. Only the values that are set change.
 */
export function applyFormStyle(design: FormDesign, style: FormStyle | null | undefined): FormDesign {
  const next = structuredClone(design);
  if (!style) return next;

  if (style.labelColor) next.typography.label.color = style.labelColor;
  if (style.inputTextColor) next.typography.input.color = style.inputTextColor;
  if (style.helpColor) next.typography.help.color = style.helpColor;

  if (style.inputBackground) next.input.background = style.inputBackground;
  if (style.inputBorderColor) {
    next.input.border.color = style.inputBorderColor;
    if (next.input.border.style === 'none') next.input.border.style = 'solid';
  }
  if (style.inputRadius) next.input.border.radius = style.inputRadius;

  if (style.buttonAlign === 'full') {
    next.button.width = 'full';
  } else if (style.buttonAlign !== 'inherit') {
    next.button.align = style.buttonAlign;
    if (next.button.width === 'full') next.button.width = 'auto';
  }
  if (style.buttonBackground) next.button.background = style.buttonBackground;
  if (style.buttonTextColor) next.button.textColor = style.buttonTextColor;
  if (style.buttonHoverBackground) next.button.hoverBackground = style.buttonHoverBackground;
  if (style.buttonHoverTextColor) next.button.hoverTextColor = style.buttonHoverTextColor;
  if (style.buttonRadius) next.button.border.radius = style.buttonRadius;

  return next;
}

const CARD_SHADOWS: Record<Exclude<(typeof FORM_CARD_SHADOWS)[number], 'inherit'>, string> = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.05)',
  md: '0 4px 12px rgb(0 0 0 / 0.08)',
  lg: '0 10px 30px rgb(0 0 0 / 0.12)',
};

/** The card's inline style — only the values that are set. */
export function formCardStyle(style: FormStyle | null | undefined): React.CSSProperties {
  const out: React.CSSProperties = {};
  if (!style) return out;
  if (style.cardBackground) out.backgroundColor = style.cardBackground;
  if (style.cardBorderColor) out.borderColor = style.cardBorderColor;
  if (style.cardRadius) out.borderRadius = style.cardRadius;
  if (style.cardPadding) out.padding = style.cardPadding;
  if (style.cardShadow !== 'inherit') out.boxShadow = CARD_SHADOWS[style.cardShadow];
  // Auto margins place a narrower card in a hero's grid cell and in an
  // ordinary block alike. Only when a width is set: a full-width card has
  // nowhere to move.
  if (style.cardWidth) {
    out.maxWidth = style.cardWidth;
    out.marginLeft = style.cardPosition === 'left' ? 0 : 'auto';
    out.marginRight = style.cardPosition === 'right' ? 0 : 'auto';
  }
  return out;
}

/**
 * Whether a block with no card of its own should draw one: only when a
 * background, a border colour or a visible shadow has been chosen.
 */
export function wantsFormCard(style: FormStyle | null | undefined): boolean {
  if (!style) return false;
  return Boolean(
    style.cardBackground ||
      style.cardBorderColor ||
      (style.cardShadow !== 'inherit' && style.cardShadow !== 'none'),
  );
}

export type FormFieldGroup = { title: string; fields: FieldDescriptor[] };

const ALIGN_OPTIONS = [
  { label: 'Form default', value: 'inherit' },
  { label: 'Left', value: 'left' },
  { label: 'Centre', value: 'center' },
  { label: 'Right', value: 'right' },
];

const BLANK_HINT = 'Blank keeps the form’s own design.';

/**
 * The Form tab, in four groups.
 *
 * A block that already has a field for the heading, the description or the
 * button text points at it here instead of getting a second copy, and must
 * then drop it from its Content tab. `card: false` leaves out the Card group
 * for a block whose form already sits inside a box of its own.
 */
export function formStyleGroups(
  options: { heading?: string; description?: string; buttonLabel?: string; card?: boolean } = {},
): FormFieldGroup[] {
  const groups: FormFieldGroup[] = [
    {
      title: 'Heading',
      fields: [
        {
          kind: 'text',
          name: options.heading ?? 'formStyle.heading',
          label: 'Form heading',
          width: 'half',
        },
        {
          kind: 'select',
          name: 'formStyle.headingAlign',
          label: 'Heading alignment',
          width: 'half',
          options: ALIGN_OPTIONS,
        },
        {
          kind: 'textarea',
          name: options.description ?? 'formStyle.description',
          label: 'Form description',
          rows: 2,
        },
        { kind: 'color', name: 'formStyle.headingColor', label: 'Heading colour', width: 'half' },
        { kind: 'length', name: 'formStyle.headingSize', label: 'Heading size', width: 'half' },
        {
          kind: 'color',
          name: 'formStyle.descriptionColor',
          label: 'Description colour',
          width: 'half',
        },
      ],
    },
    {
      title: 'Text and fields',
      fields: [
        { kind: 'color', name: 'formStyle.labelColor', label: 'Label colour', width: 'half', help: BLANK_HINT },
        { kind: 'color', name: 'formStyle.inputTextColor', label: 'Input text colour', width: 'half' },
        { kind: 'color', name: 'formStyle.helpColor', label: 'Help text colour', width: 'half' },
        { kind: 'color', name: 'formStyle.inputBackground', label: 'Field background', width: 'half' },
        { kind: 'color', name: 'formStyle.inputBorderColor', label: 'Field border colour', width: 'half' },
        { kind: 'length', name: 'formStyle.inputRadius', label: 'Field corner radius', width: 'half' },
      ],
    },
    {
      title: 'Button',
      fields: [
        {
          kind: 'text',
          name: options.buttonLabel ?? 'formStyle.buttonLabel',
          label: 'Button text',
          width: 'half',
          placeholder: 'The form’s own label',
        },
        {
          kind: 'select',
          name: 'formStyle.buttonAlign',
          label: 'Button alignment',
          width: 'half',
          options: [...ALIGN_OPTIONS, { label: 'Full width', value: 'full' }],
        },
        { kind: 'color', name: 'formStyle.buttonBackground', label: 'Button colour', width: 'half' },
        { kind: 'color', name: 'formStyle.buttonTextColor', label: 'Button text colour', width: 'half' },
        {
          kind: 'color',
          name: 'formStyle.buttonHoverBackground',
          label: 'Button colour on hover',
          width: 'half',
        },
        {
          kind: 'color',
          name: 'formStyle.buttonHoverTextColor',
          label: 'Button text on hover',
          width: 'half',
        },
        { kind: 'length', name: 'formStyle.buttonRadius', label: 'Button corner radius', width: 'half' },
      ],
    },
  ];

  if (options.card !== false) {
    groups.push({
      title: 'Card',
      fields: [
        { kind: 'color', name: 'formStyle.cardBackground', label: 'Card background', width: 'half' },
        { kind: 'color', name: 'formStyle.cardBorderColor', label: 'Card border colour', width: 'half' },
        { kind: 'length', name: 'formStyle.cardRadius', label: 'Card corner radius', width: 'half' },
        { kind: 'length', name: 'formStyle.cardPadding', label: 'Card padding', width: 'half' },
        {
          kind: 'select',
          name: 'formStyle.cardShadow',
          label: 'Card shadow',
          width: 'half',
          options: [
            { label: 'Form default', value: 'inherit' },
            { label: 'None', value: 'none' },
            { label: 'Small', value: 'sm' },
            { label: 'Medium', value: 'md' },
            { label: 'Large', value: 'lg' },
          ],
        },
        {
          kind: 'length',
          name: 'formStyle.cardWidth',
          label: 'Card width',
          width: 'half',
          help: 'Blank fills the column; 380px makes a narrow form.',
        },
        {
          kind: 'select',
          name: 'formStyle.cardPosition',
          label: 'Card position',
          width: 'half',
          help: 'Where a narrower card sits in its column.',
          options: [
            { label: 'Centre', value: 'center' },
            { label: 'Left', value: 'left' },
            { label: 'Right', value: 'right' },
          ],
        },
      ],
    });
  }

  return groups;
}

/** Help text for a block's form picker, pointing at the new tab. */
export const FORM_PICKER_HELP = 'Its heading, colours and button are on the Form tab.';
