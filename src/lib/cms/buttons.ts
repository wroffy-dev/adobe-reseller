import { cssColor, cssLength } from './chrome';

/**
 * The Primary and Secondary button designs.
 *
 * Every public button carries `btn-tokens` and, through `buttonClasses`, a role
 * class: a primary call to action is `btn-role-primary`, a secondary or outline
 * one `btn-role-secondary`. Website Design → Design gives each role a style
 * (solid, outline or soft tint) and six colours, and this module turns those
 * into one small stylesheet.
 *
 * The rule the whole screen rests on: a blank value means "keep what it looks
 * like now". A role left at its default style with no colours emits nothing,
 * so a site that never opens the screen renders exactly as it did. Pure — no
 * Prisma, no React — so it runs in the root layout and in unit tests alike.
 */

export const BUTTON_ROLES = ['primary', 'secondary'] as const;
export type ButtonRole = (typeof BUTTON_ROLES)[number];

/** Marker classes. They do nothing without `btn-tokens`. */
export const BUTTON_ROLE_CLASS: Record<ButtonRole, string> = {
  primary: 'btn-role-primary',
  secondary: 'btn-role-secondary',
};

export const BUTTON_STYLES = ['solid', 'outline', 'soft'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

/** What each role looks like when nobody has chosen anything. */
export const DEFAULT_BUTTON_STYLE: Record<ButtonRole, ButtonStyle> = {
  primary: 'solid',
  secondary: 'outline',
};

type Value = string | null | undefined;

/** The settings this module reads — a subset of the WebsiteSettings row. */
export type ButtonSettings = {
  colorPrimary?: Value;
  colorSecondary?: Value;
  buttonBorderWidth?: Value;
  buttonPrimaryStyle?: Value;
  buttonPrimaryBg?: Value;
  buttonPrimaryText?: Value;
  buttonPrimaryBorder?: Value;
  buttonPrimaryHoverBg?: Value;
  buttonPrimaryHoverText?: Value;
  buttonPrimaryHoverBorder?: Value;
  buttonSecondaryStyle?: Value;
  buttonSecondaryBg?: Value;
  buttonSecondaryText?: Value;
  buttonSecondaryBorder?: Value;
  buttonSecondaryHoverBg?: Value;
  buttonSecondaryHoverText?: Value;
  buttonSecondaryHoverBorder?: Value;
  buttonPrimaryRadius?: Value;
  buttonSecondaryRadius?: Value;
};

/** One role's colours. An empty string is "not set". */
export type ButtonLook = {
  background: string;
  text: string;
  border: string;
  hoverBackground: string;
  hoverText: string;
  hoverBorder: string;
};

const EMPTY_LOOK: ButtonLook = {
  background: '',
  text: '',
  border: '',
  hoverBackground: '',
  hoverText: '',
  hoverBorder: '',
};

/**
 * Button shapes, picked by sight. Each preset is only a radius, so a shape is
 * stored as the length it stands for and anything else is a custom radius.
 */
export const BUTTON_SHAPES = [
  { id: 'square', label: 'Square', radius: '0px' },
  { id: 'slight', label: 'Slightly rounded', radius: '0.25rem' },
  { id: 'rounded', label: 'Rounded', radius: '0.5rem' },
  { id: 'pill', label: 'Pill', radius: '999px' },
] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

/** The preset a radius is, or null for a custom (or blank) one. */
export function buttonShapeOf(radius: string | null | undefined): ButtonShape | null {
  const value = (radius ?? '').trim();
  return BUTTON_SHAPES.find((shape) => shape.radius === value) ?? null;
}

/** `buttonPrimaryRadius` or `buttonSecondaryRadius`. */
export function roleRadiusField(role: ButtonRole) {
  return role === 'primary' ? 'buttonPrimaryRadius' : 'buttonSecondaryRadius';
}

/** The six colour fields of a role, in the order the admin shows them. */
export const BUTTON_COLOR_KEYS = [
  'Bg',
  'Text',
  'Border',
  'HoverBg',
  'HoverText',
  'HoverBorder',
] as const;

const LOOK_KEY: Record<(typeof BUTTON_COLOR_KEYS)[number], keyof ButtonLook> = {
  Bg: 'background',
  Text: 'text',
  Border: 'border',
  HoverBg: 'hoverBackground',
  HoverText: 'hoverText',
  HoverBorder: 'hoverBorder',
};

/** `buttonPrimaryBg`, `buttonSecondaryHoverText`, … */
export function buttonField(role: ButtonRole, key: (typeof BUTTON_COLOR_KEYS)[number]) {
  return `button${role === 'primary' ? 'Primary' : 'Secondary'}${key}` as keyof ButtonSettings;
}

function styleOf(settings: ButtonSettings, role: ButtonRole): ButtonStyle {
  const raw = (role === 'primary' ? settings.buttonPrimaryStyle : settings.buttonSecondaryStyle) ?? '';
  return (BUTTON_STYLES as readonly string[]).includes(raw) ? (raw as ButtonStyle) : DEFAULT_BUTTON_STYLE[role];
}

/** A theme colour as CSS: the hex when valid, else the runtime brand variable. */
function themeColor(settings: ButtonSettings, which: 'primary' | 'secondary'): string {
  const hex = cssColor(which === 'primary' ? settings.colorPrimary : settings.colorSecondary);
  return hex ?? `rgb(var(--brand-${which}))`;
}

const darken = (color: string) => `color-mix(in srgb, ${color} 88%, #000)`;
const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** A whole look drawn from one colour in one style. */
function styleLook(style: ButtonStyle, color: string): ButtonLook {
  switch (style) {
    case 'solid':
      return {
        background: color,
        text: '#FFFFFF',
        border: color,
        hoverBackground: darken(color),
        hoverText: '#FFFFFF',
        hoverBorder: darken(color),
      };
    case 'outline':
      return {
        background: 'transparent',
        text: color,
        border: color,
        hoverBackground: tint(color, 10),
        hoverText: color,
        hoverBorder: color,
      };
    case 'soft':
      return {
        background: tint(color, 14),
        text: color,
        border: 'transparent',
        hoverBackground: tint(color, 24),
        hoverText: color,
        hoverBorder: 'transparent',
      };
  }
}

/** A solid secondary is drawn in the secondary colour; everything else in the primary. */
function colorFor(role: ButtonRole, style: ButtonStyle, settings: ButtonSettings): string {
  return role === 'secondary' && style === 'solid'
    ? themeColor(settings, 'secondary')
    : themeColor(settings, 'primary');
}

/**
 * The colours a role's rule should set — only what somebody chose.
 *
 * The default style (solid primary, outline secondary) contributes nothing:
 * the component already draws it. Any other style fills in a full look from a
 * theme colour. Each colour typed in the admin then replaces its part of that
 * look; a typed background with no hover background gets a darkened hover, and
 * typed text and border colours carry into hover.
 */
export function buttonLook(settings: ButtonSettings, role: ButtonRole): ButtonLook {
  const style = styleOf(settings, role);
  const look: ButtonLook =
    style === DEFAULT_BUTTON_STYLE[role]
      ? { ...EMPTY_LOOK }
      : styleLook(style, colorFor(role, style, settings));

  const typed = Object.fromEntries(
    BUTTON_COLOR_KEYS.map((key) => [LOOK_KEY[key], cssColor(settings[buttonField(role, key)]) ?? '']),
  ) as ButtonLook;

  if (typed.background) {
    look.background = typed.background;
    look.hoverBackground = darken(typed.background);
  }
  if (typed.text) {
    look.text = typed.text;
    look.hoverText = typed.text;
  }
  if (typed.border) {
    look.border = typed.border;
    look.hoverBorder = typed.border;
  }
  if (typed.hoverBackground) look.hoverBackground = typed.hoverBackground;
  if (typed.hoverText) look.hoverText = typed.hoverText;
  if (typed.hoverBorder) look.hoverBorder = typed.hoverBorder;

  return look;
}

/** The role's look as the site draws it untouched, for the admin preview. */
function defaultLook(settings: ButtonSettings, role: ButtonRole): ButtonLook {
  const style = DEFAULT_BUTTON_STYLE[role];
  return styleLook(style, colorFor(role, style, settings));
}

/**
 * What the admin preview paints: the resolved look laid over the role's
 * default look, so the preview is complete even where nothing was chosen.
 */
export function previewLook(settings: ButtonSettings, role: ButtonRole): ButtonLook {
  const base = defaultLook(settings, role);
  const chosen = buttonLook(settings, role);
  return Object.fromEntries(
    (Object.keys(base) as Array<keyof ButtonLook>).map((key) => [key, chosen[key] || base[key]]),
  ) as ButtonLook;
}

/** Declarations for one state, only for the parts that are set. */
function declarations(
  background: string,
  text: string,
  border: string,
  width: string | null,
): string[] {
  const out: string[] = [];
  if (background) out.push(`background-color:${background}`);
  if (text) out.push(`color:${text}`);
  // A button drawn with an outline border edges in its own fill.
  const edge = border || background;
  if (edge) out.push(`border-color:${edge}`);
  if (border && border !== 'transparent') {
    out.push('border-style:solid', `border-width:${width ?? '1px'}`);
  }
  return out;
}

/**
 * The CSS for every value that was set, and nothing else.
 *
 * `:root .btn-tokens.btn-role-x` is three classes deep, so it beats Tailwind's
 * single-class utilities and a section's two-class default button rules
 * whatever order the stylesheets load in. It reads no section variable: a
 * section's own button colour is a separate, stronger rule.
 */
export function buttonStylesheet(settings: ButtonSettings): string {
  const width = cssLength(settings.buttonBorderWidth);
  const blocks: string[] = [];

  for (const role of BUTTON_ROLES) {
    const look = buttonLook(settings, role);
    const selector = `:root .btn-tokens.${BUTTON_ROLE_CLASS[role]}`;

    const normal = declarations(look.background, look.text, look.border, width);
    // The role's own shape, only when it has one; blank follows buttonRadius.
    const radius = cssLength(settings[roleRadiusField(role)]);
    if (radius) normal.push(`border-radius:${radius}`);
    const hover = declarations(look.hoverBackground, look.hoverText, look.hoverBorder, width);

    if (normal.length > 0) blocks.push(`${selector}{${normal.join(';')}}`);
    if (hover.length > 0) blocks.push(`${selector}:hover{${hover.join(';')}}`);

    // A width alone only thickens borders that already exist.
    if (width && !look.border) {
      blocks.push(`${selector}.border{border-width:${width}}`);
    }
  }

  return blocks.join('');
}
