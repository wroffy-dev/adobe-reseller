import { z } from 'zod';
import { normaliseColor, parseColor } from './color';

/**
 * Universal section design configuration.
 *
 * Every section on every page stores one of these in `PageSection.settings`.
 * It is deliberately independent of the block type: adding a new block gives it
 * the full design panel for free.
 *
 * Values are emitted as CSS custom properties rather than utility classes, which
 * is what makes arbitrary admin-entered values (`37px`, `4.5vh`, `85%`) work at
 * three breakpoints without generating a single extra byte of Tailwind.
 */

export const BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

export const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/** Widths at which the tablet and mobile overrides take over. */
export const BREAKPOINT_MAX_WIDTH: Record<Exclude<Breakpoint, 'desktop'>, number> = {
  tablet: 1023,
  mobile: 767,
};

export const LENGTH_UNITS = ['px', '%', 'rem', 'em', 'vw', 'vh'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

const LENGTH_PATTERN = /^-?\d+(\.\d+)?(px|%|rem|em|vw|vh)$/;

/**
 * A length is stored as the literal CSS string the admin built ("40px").
 * An empty string means "not set" — the value is inherited from the larger
 * breakpoint, and on desktop it falls back to the section default.
 */
export function normaliseLength(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return `${raw}px`;
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  if (LENGTH_PATTERN.test(value)) return value;
  // A bare number is the most common thing a non-technical admin types.
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  return '';
}

export function splitLength(value: string): { amount: string; unit: LengthUnit } {
  const match = LENGTH_PATTERN.exec(value ?? '');
  if (!match) return { amount: '', unit: 'px' };
  const unit = (LENGTH_UNITS.find((u) => value.endsWith(u)) ?? 'px') as LengthUnit;
  return { amount: value.slice(0, value.length - unit.length), unit };
}

export function joinLength(amount: string, unit: LengthUnit): string {
  const trimmed = String(amount ?? '').trim();
  if (!trimmed) return '';
  return normaliseLength(`${trimmed}${unit}`);
}

const length = z.preprocess(normaliseLength, z.string());

const boxSchema = z.object({
  top: length.default(''),
  right: length.default(''),
  bottom: length.default(''),
  left: length.default(''),
});

export type BoxValue = z.infer<typeof boxSchema>;
export const EMPTY_BOX: BoxValue = { top: '', right: '', bottom: '', left: '' };

/*
 * A colour, with its opacity inside it: `#RRGGBB` or `#RRGGBBAA`. Anything
 * else becomes `''`, which means "inherit" everywhere this is read — never
 * black, which is what a colour nobody chose must not silently become.
 */
const hex = z
  .string()
  .trim()
  .transform((v) => normaliseColor(v))
  .default('');

/** Everything that can differ between desktop, tablet and mobile. */
const breakpointSchema = z.object({
  margin: boxSchema.default(EMPTY_BOX),
  padding: boxSchema.default(EMPTY_BOX),
  columns: z.coerce.number().int().min(1).max(6).nullable().catch(null).default(null),
  contentWidth: length.default(''),
  minHeight: length.default(''),
  align: z.enum(['inherit', 'left', 'center', 'right']).catch('inherit').default('inherit'),
  headingSize: length.default(''),
  bodySize: length.default(''),
  rowGap: length.default(''),
  columnGap: length.default(''),
  contentGap: length.default(''),
  cardGap: length.default(''),
  imageWidth: length.default(''),
  imageHeight: length.default(''),
  hidden: z.coerce.boolean().catch(false).default(false),
});

export type BreakpointDesign = z.infer<typeof breakpointSchema>;

const backgroundSchema = z.object({
  type: z.enum(['none', 'solid', 'gradient', 'image']).catch('none').default('none'),
  color: hex,
  gradientFrom: hex,
  gradientTo: hex,
  gradientAngle: z.coerce.number().int().min(0).max(360).catch(160).default(160),
  imageId: z.string().max(40).nullable().catch(null).default(null),
  imagePosition: z
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
    .default('center'),
  imageSize: z.enum(['cover', 'contain', 'auto']).catch('cover').default('cover'),
  imageRepeat: z
    .enum(['no-repeat', 'repeat', 'repeat-x', 'repeat-y'])
    .catch('no-repeat')
    .default('no-repeat'),
  imageAttachment: z.enum(['scroll', 'fixed']).catch('scroll').default('scroll'),
  overlayColor: hex,
  overlayOpacity: z.coerce.number().min(0).max(100).catch(0).default(0),
});

export { backgroundSchema };
export type BackgroundDesign = z.infer<typeof backgroundSchema>;

/**
 * Styling for a *panel* drawn inside a section — the CTA box, for instance.
 *
 * This is not a duplicate of the section design: a section styles the full-width
 * band, this styles the card sitting within it, and the two are set
 * independently. It reuses the same background schema and the same length
 * handling, so an admin learns one set of controls.
 */
export const panelDesignSchema = z.object({
  background: backgroundSchema.default(backgroundSchema.parse({})),
  borderEnabled: z.boolean().catch(false).default(false),
  borderColor: hex,
  borderWidth: z.string().max(20).catch('').default(''),
  radius: z.string().max(20).catch('').default(''),
  shadow: z.enum(['none', 'sm', 'md', 'lg', 'xl']).catch('none').default('none'),
  padding: boxSchema.default(EMPTY_BOX),
  headingColor: hex,
  textColor: hex,
});

export type PanelDesign = z.infer<typeof panelDesignSchema>;

export const DEFAULT_PANEL_DESIGN: PanelDesign = panelDesignSchema.parse({});

const SHADOW_VALUES: Record<PanelDesign['shadow'], string> = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.05)',
  md: '0 4px 12px rgb(0 0 0 / 0.08)',
  lg: '0 10px 30px rgb(0 0 0 / 0.12)',
  xl: '0 20px 50px rgb(0 0 0 / 0.18)',
};

export type PanelStyles = {
  style: Record<string, string>;
  /** True when the admin configured any background at all. */
  hasBackground: boolean;
  overlay: string | null;
};

/**
 * Turns a panel's design into inline CSS.
 *
 * `hasBackground` lets a block keep its historical default — the CTA's brand
 * panel — until the admin actually chooses something, so nothing changes
 * underneath sections that were saved before these controls existed.
 */
export function buildPanelStyles(
  panel: PanelDesign,
  backgroundImageUrl: string | null = null,
): PanelStyles {
  const style: Record<string, string> = {};
  const bg = panel.background;

  let hasBackground = false;
  if (bg.type === 'solid' && bg.color) {
    style.backgroundColor = bg.color;
    hasBackground = true;
  } else if (bg.type === 'gradient' && (bg.gradientFrom || bg.gradientTo)) {
    style.backgroundImage = `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom || 'transparent'}, ${bg.gradientTo || 'transparent'})`;
    hasBackground = true;
  } else if (bg.type === 'image' && backgroundImageUrl) {
    style.backgroundImage = `url("${backgroundImageUrl.replace(/"/g, '%22')}")`;
    style.backgroundPosition = bg.imagePosition;
    style.backgroundSize = bg.imageSize;
    style.backgroundRepeat = bg.imageRepeat;
    style.backgroundAttachment = bg.imageAttachment;
    hasBackground = true;
  }

  if (panel.borderEnabled) {
    style.borderStyle = 'solid';
    style.borderWidth = normaliseLength(panel.borderWidth) || '1px';
    style.borderColor = panel.borderColor || 'rgb(var(--brand-border))';
  }

  const radius = normaliseLength(panel.radius);
  if (radius) style.borderRadius = radius;
  if (panel.shadow !== 'none') style.boxShadow = SHADOW_VALUES[panel.shadow];

  for (const [side, value] of Object.entries(panel.padding)) {
    const length = normaliseLength(value);
    if (!length) continue;
    style[`padding${side.charAt(0).toUpperCase()}${side.slice(1)}`] = length;
  }

  if (panel.headingColor) style['--panel-heading'] = panel.headingColor;
  if (panel.textColor) style['--panel-text'] = panel.textColor;

  const overlay =
    bg.overlayColor && bg.overlayOpacity > 0 ? hexToRgba(bg.overlayColor, bg.overlayOpacity) : null;

  return { style, hasBackground, overlay };
}

const colorsSchema = z.object({
  primary: hex,
  secondary: hex,
  text: hex,
  heading: hex,
  background: hex,
  button: hex,
  buttonText: hex,
  link: hex,
  /** Forces light-on-dark treatment regardless of the chosen background. */
  invertText: z.coerce.boolean().catch(false).default(false),
});

/** Quick background presets, kept from the original design panel. */
export const SECTION_PRESETS = ['default', 'muted', 'brand', 'dark', 'gradient'] as const;
export type SectionPreset = (typeof SECTION_PRESETS)[number];

export const WIDTH_MODES = ['boxed', 'narrow', 'wide', 'full', 'custom'] as const;
export type WidthMode = (typeof WIDTH_MODES)[number];

/** Anchor IDs must be usable in a URL fragment and as a CSS selector. */
export const ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export function normaliseAnchor(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  if (!value) return '';
  return ANCHOR_PATTERN.test(value) ? value : `s-${value}`.slice(0, 63);
}

export const sectionDesignSchema = z.object({
  preset: z.enum(SECTION_PRESETS).catch('default').default('default'),
  widthMode: z.enum(WIDTH_MODES).catch('boxed').default('boxed'),
  maxWidth: length.default(''),
  background: backgroundSchema.default(backgroundSchema.parse({})),
  colors: colorsSchema.default(colorsSchema.parse({})),
  desktop: breakpointSchema.default(breakpointSchema.parse({})),
  tablet: breakpointSchema.default(breakpointSchema.parse({})),
  mobile: breakpointSchema.default(breakpointSchema.parse({})),
  anchorId: z.preprocess(normaliseAnchor, z.string()).default(''),
  /**
   * Take the section out of the product page's boxed column, so its
   * background runs to the edges of the screen and its content sits in the
   * same container as a page's sections — lined up with the header.
   *
   * Only product pages read it: a page's sections already span the screen.
   */
  stretch: z.coerce.boolean().catch(false).default(false),
});

export type SectionDesign = z.infer<typeof sectionDesignSchema>;

export const DEFAULT_SECTION_DESIGN: SectionDesign = sectionDesignSchema.parse({});

// ---------------------------------------------------------------------------
// Legacy upgrade
// ---------------------------------------------------------------------------

/** The v1 padding scale, translated into real lengths. */
const LEGACY_PADDING: Record<string, { desktop: string; mobile: string }> = {
  none: { desktop: '0px', mobile: '0px' },
  sm: { desktop: '2rem', mobile: '1.5rem' },
  md: { desktop: '3.5rem', mobile: '2.5rem' },
  lg: { desktop: '5rem', mobile: '3rem' },
  xl: { desktop: '7rem', mobile: '4rem' },
};

const LEGACY_WIDTH: Record<string, WidthMode> = {
  narrow: 'narrow',
  default: 'boxed',
  wide: 'wide',
  full: 'full',
};

function isLegacyShape(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.background === 'string' ||
    typeof raw.paddingTop === 'string' ||
    typeof raw.paddingBottom === 'string' ||
    typeof raw.hideOnMobile === 'boolean' ||
    typeof raw.hideOnDesktop === 'boolean' ||
    (typeof raw.width === 'string' && raw.widthMode === undefined)
  );
}

/**
 * Rewrites a v1 settings object into the current shape.
 *
 * Runs at read time so no data migration is needed: pages built before this
 * upgrade keep their exact spacing, background and visibility.
 */
function upgradeLegacy(raw: Record<string, unknown>): SectionDesign {
  const preset = SECTION_PRESETS.includes(raw.background as SectionPreset)
    ? (raw.background as SectionPreset)
    : 'default';

  const top = LEGACY_PADDING[String(raw.paddingTop ?? 'lg')] ?? LEGACY_PADDING.lg!;
  const bottom = LEGACY_PADDING[String(raw.paddingBottom ?? 'lg')] ?? LEGACY_PADDING.lg!;

  const hideOnMobile = raw.hideOnMobile === true;
  const hideOnDesktop = raw.hideOnDesktop === true;

  return sectionDesignSchema.parse({
    preset,
    widthMode: LEGACY_WIDTH[String(raw.width ?? 'default')] ?? 'boxed',
    anchorId: raw.anchorId ?? '',
    desktop: {
      padding: { top: top.desktop, right: '', bottom: bottom.desktop, left: '' },
      hidden: hideOnDesktop,
    },
    // v1 hid "on mobile" using a `lg` breakpoint, which covered tablets too.
    tablet: { hidden: hideOnMobile },
    mobile: {
      padding: { top: top.mobile, right: '', bottom: bottom.mobile, left: '' },
      hidden: hideOnMobile,
    },
  });
}

/** Parses stored section settings, upgrading the v1 shape on the way through. */
export function parseSectionDesign(raw: unknown): SectionDesign {
  if (raw === null || raw === undefined) return DEFAULT_SECTION_DESIGN;
  if (typeof raw !== 'object') return DEFAULT_SECTION_DESIGN;

  const record = raw as Record<string, unknown>;
  if (isLegacyShape(record)) {
    try {
      return upgradeLegacy(record);
    } catch {
      return DEFAULT_SECTION_DESIGN;
    }
  }

  const result = sectionDesignSchema.safeParse(record);
  return result.success ? result.data : DEFAULT_SECTION_DESIGN;
}

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

export const WIDTH_PRESET_VALUES: Record<Exclude<WidthMode, 'custom' | 'full'>, string> = {
  narrow: '48rem',
  boxed: 'var(--layout-container, 72rem)',
  wide: '80rem',
};

/**
 * A colour at a given opacity, for the overlay controls that set one
 * separately from the colour.
 *
 * Where the colour already carries its own opacity the two multiply, which is
 * what somebody who dimmed a colour and then dimmed the overlay means.
 */
function hexToRgba(value: string, alpha: number): string {
  const parsed = parseColor(value);
  if (!parsed) return 'transparent';

  const digits = parsed.hex.slice(1);
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  const combined = (Math.min(Math.max(alpha, 0), 100) / 100) * (parsed.alpha / 100);
  return `rgba(${r}, ${g}, ${b}, ${combined})`;
}

/** Background colour + text colour implied by a preset, before overrides. */
const PRESET_TOKENS: Record<
  SectionPreset,
  { bg: string; text: string; heading: string; inverted: boolean }
> = {
  default: {
    bg: 'rgb(var(--brand-background))',
    text: 'rgb(var(--brand-muted))',
    heading: 'rgb(var(--brand-text))',
    inverted: false,
  },
  muted: {
    bg: 'rgb(var(--brand-muted) / 0.045)',
    text: 'rgb(var(--brand-muted))',
    heading: 'rgb(var(--brand-text))',
    inverted: false,
  },
  brand: {
    bg: 'rgb(var(--brand-primary))',
    text: 'rgba(255,255,255,0.85)',
    heading: '#FFFFFF',
    inverted: true,
  },
  dark: {
    bg: 'rgb(var(--brand-secondary))',
    text: 'rgba(255,255,255,0.85)',
    heading: '#FFFFFF',
    inverted: true,
  },
  gradient: {
    bg: 'transparent',
    text: 'rgb(var(--brand-muted))',
    heading: 'rgb(var(--brand-text))',
    inverted: false,
  },
};

/** True when the section paints a dark surface and its content needs inverting. */
export function isInverted(design: SectionDesign): boolean {
  if (design.colors.invertText) return true;
  if (design.colors.background) return false;
  if (design.background.type === 'solid' && design.background.color) return false;
  if (design.background.type === 'image' && design.background.overlayOpacity >= 40) return true;
  return PRESET_TOKENS[design.preset].inverted;
}

type VarMap = Record<string, string>;

function boxVars(prefix: string, box: BoxValue): VarMap {
  const vars: VarMap = {};
  if (box.top) vars[`${prefix}t`] = box.top;
  if (box.right) vars[`${prefix}r`] = box.right;
  if (box.bottom) vars[`${prefix}b`] = box.bottom;
  if (box.left) vars[`${prefix}l`] = box.left;
  return vars;
}

/** The variables one breakpoint contributes. Empty values are simply omitted. */
function breakpointVars(bp: BreakpointDesign, includeDisplay: boolean): VarMap {
  const vars: VarMap = {
    ...boxVars('--sec-m', bp.margin),
    ...boxVars('--sec-p', bp.padding),
  };
  if (bp.contentWidth) vars['--sec-max-w'] = bp.contentWidth;
  if (bp.minHeight) vars['--sec-min-h'] = bp.minHeight;
  if (bp.align !== 'inherit') vars['--sec-align'] = bp.align;
  if (bp.headingSize) vars['--sec-heading-size'] = bp.headingSize;
  if (bp.bodySize) vars['--sec-body-size'] = bp.bodySize;
  if (bp.rowGap) vars['--sec-row-gap'] = bp.rowGap;
  if (bp.columnGap) vars['--sec-col-gap'] = bp.columnGap;
  if (bp.contentGap) vars['--sec-content-gap'] = bp.contentGap;
  if (bp.cardGap) vars['--sec-card-gap'] = bp.cardGap;
  if (bp.imageWidth) vars['--sec-img-w'] = bp.imageWidth;
  if (bp.imageHeight) vars['--sec-img-h'] = bp.imageHeight;
  if (includeDisplay) vars['--sec-display'] = bp.hidden ? 'none' : 'block';
  else if (bp.hidden) vars['--sec-display'] = 'none';
  return vars;
}

function widthVar(design: SectionDesign): string | null {
  if (design.widthMode === 'full') return '100%';
  if (design.widthMode === 'custom') return design.maxWidth || null;
  return WIDTH_PRESET_VALUES[design.widthMode];
}

function backgroundLayer(design: SectionDesign, imageUrl: string | null): string | null {
  const bg = design.background;
  if (bg.type === 'gradient' && (bg.gradientFrom || bg.gradientTo)) {
    const from = bg.gradientFrom || 'transparent';
    const to = bg.gradientTo || 'transparent';
    return `linear-gradient(${bg.gradientAngle}deg, ${from}, ${to})`;
  }
  if (bg.type === 'image' && imageUrl) {
    return `url("${imageUrl.replace(/"/g, '%22')}")`;
  }
  if (design.preset === 'gradient' && bg.type === 'none') {
    return 'linear-gradient(180deg, rgb(var(--brand-primary) / 0.07), rgb(var(--brand-background)))';
  }
  return null;
}

export type SectionStyles = {
  /** Stable class the generated media queries hang off. */
  className: string;
  /** Desktop values, applied inline so they always win. */
  style: Record<string, string>;
  /** Tablet and mobile overrides, or "" when there are none. */
  css: string;
  /** Absolutely-positioned background layer, or null. */
  layer: {
    image: string | null;
    position: string;
    size: string;
    repeat: string;
    attachment: string;
  } | null;
  overlay: string | null;
  inverted: boolean;
  /**
   * `cms-section--button` when the section chose a button colour and
   * `cms-section--button-text` when it chose a button text colour; empty
   * otherwise. The section's own button rules only apply under these.
   */
  modifiers: string;
};

/**
 * Turns one section's design into everything the renderer needs.
 *
 * Desktop values go on the element as inline custom properties; tablet and
 * mobile only emit the properties they actually override, inside one media
 * query each. A section with default design emits no CSS at all.
 */
export function buildSectionStyles(
  design: SectionDesign,
  sectionId: string,
  backgroundImageUrl: string | null = null,
  /**
   * `inheritSurface` is for a section rendered inside chrome that paints its
   * own surface — the footer. A page section that nobody has restyled paints
   * the page background and the page's body colour, which is invisible on a
   * page and wrong in a dark footer: every row covers it with a white band and
   * writes grey on it. With this set, a section left at the default preset
   * sets no colour at all and inherits the one around it. Choosing a preset, a
   * background or a colour still paints, exactly as it does on a page.
   */
  options: { inheritSurface?: boolean } = {},
): SectionStyles {
  const className = `sec-${sectionId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const preset = PRESET_TOKENS[design.preset];
  const inverted = isInverted(design);

  const style: VarMap = { ...breakpointVars(design.desktop, true) };

  const width = widthVar(design);
  if (width && !style['--sec-max-w']) style['--sec-max-w'] = width;
  if (design.widthMode === 'full') style['--sec-px'] = '0px';

  // Colours: an explicit value always beats the preset.
  const untouched = Boolean(options.inheritSurface) && design.preset === 'default';
  const solid =
    design.colors.background ||
    (design.background.type === 'solid' && design.background.color
      ? design.background.color
      : '') ||
    (untouched ? '' : preset.bg);
  const text = design.colors.text || (inverted ? 'rgba(255,255,255,0.85)' : untouched ? '' : preset.text);
  const heading =
    design.colors.heading || (inverted ? '#FFFFFF' : untouched ? '' : preset.heading);

  // Left unset rather than set to a fallback: `.cms-section` reads these
  // through `var(…, transparent)` and `var(…, inherit)`, so an absent one is
  // what "take the surface around me" means.
  if (solid) style['--sec-bg'] = solid;
  if (text) style['--sec-text'] = text;
  if (heading) style['--sec-heading-color'] = heading;
  style['--sec-primary'] = design.colors.primary || 'rgb(var(--brand-primary))';
  style['--sec-secondary'] = design.colors.secondary || 'rgb(var(--brand-secondary))';
  /*
   * The button colours only when the section chose them. Always setting them —
   * to the brand colour when blank — meant every section "had" a button colour,
   * so nothing chaining through var(--sec-button, …) ever showed the Website
   * Design one. The modifiers below are what the stronger rules key on.
   */
  const sectionButton = design.colors.button || design.colors.primary;
  if (sectionButton) style['--sec-button'] = sectionButton;
  if (design.colors.buttonText) style['--sec-button-text'] = design.colors.buttonText;
  const modifiers = [
    sectionButton ? 'cms-section--button' : '',
    design.colors.buttonText ? 'cms-section--button-text' : '',
  ]
    .filter(Boolean)
    .join(' ');
  style['--sec-link'] = design.colors.link || design.colors.primary || 'rgb(var(--brand-primary))';

  const layerImage = backgroundLayer(design, backgroundImageUrl);
  const overlay =
    design.background.overlayColor && design.background.overlayOpacity > 0
      ? hexToRgba(design.background.overlayColor, design.background.overlayOpacity)
      : null;

  const blocks: string[] = [];
  for (const bp of ['tablet', 'mobile'] as const) {
    const vars = breakpointVars(design[bp], false);
    const entries = Object.entries(vars);
    if (entries.length === 0) continue;
    const decls = entries.map(([key, value]) => `${key}:${value}`).join(';');
    blocks.push(`@media (max-width:${BREAKPOINT_MAX_WIDTH[bp]}px){.${className}{${decls}}}`);
  }

  return {
    className,
    style,
    css: blocks.join(''),
    layer: layerImage
      ? {
          image: layerImage,
          position: design.background.imagePosition,
          size: design.background.type === 'image' ? design.background.imageSize : 'cover',
          repeat: design.background.imageRepeat,
          attachment: design.background.imageAttachment,
        }
      : null,
    overlay,
    inverted,
    modifiers,
  };
}

/** Anchor IDs must be unique within a page; later duplicates are dropped. */
export function resolveAnchors(
  sections: Array<{ id: string; settings: unknown }>,
): Map<string, string> {
  const used = new Set<string>();
  const resolved = new Map<string, string>();
  for (const section of sections) {
    const anchor = parseSectionDesign(section.settings).anchorId;
    if (!anchor || used.has(anchor)) continue;
    used.add(anchor);
    resolved.set(section.id, anchor);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Grid columns
// ---------------------------------------------------------------------------

export type ResolvedColumns = { desktop: number; tablet: number; mobile: number };

/**
 * Column count per breakpoint.
 *
 * The design panel wins when it has a value; otherwise the block's own setting
 * is used, and tablet/mobile inherit downwards (desktop -> tablet -> mobile).
 *
 * `fallback` moves where a block lands when nobody has chosen for it. Cards
 * narrow to two and then one, which is the default; a thumbnail grid says so,
 * because one thumbnail per row is not a gallery. The design panel still wins
 * over it — this decides only what "Automatic" means for that block.
 */
export function resolveColumns(
  design: SectionDesign,
  blockColumns: number,
  fallback?: { tablet?: number; mobile?: number },
): ResolvedColumns {
  const clamp = (value: number) => Math.min(Math.max(Math.round(value) || 1, 1), 6);
  const desktop = clamp(design.desktop.columns ?? blockColumns);
  const tablet = clamp(design.tablet.columns ?? fallback?.tablet ?? Math.min(desktop, 2));
  const mobile = clamp(design.mobile.columns ?? fallback?.mobile ?? Math.min(tablet, 1));
  return { desktop, tablet, mobile };
}

/** CSS variables the `.cms-grid` rules read. */
export function gridStyle(columns: ResolvedColumns): Record<string, string> {
  return {
    '--grid-cols': String(columns.desktop),
    '--grid-cols-tablet': String(columns.tablet),
    '--grid-cols-mobile': String(columns.mobile),
  };
}
