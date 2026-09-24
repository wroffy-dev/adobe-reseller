import type { WebsiteSettings } from '@prisma/client';
import { fontStack, googleFontsHref, nearestWeight } from '@/lib/cms/google-fonts';
import { chromeStylesheet } from '@/lib/cms/chrome';
import { buttonStylesheet } from '@/lib/cms/buttons';

/** Converts #RRGGBB to the "R G B" triple Tailwind's <alpha-value> tokens need. */
function rgbTriple(hex: string, fallback: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  if (!match) return fallback;
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const LENGTH = /^-?\d+(\.\d+)?(px|%|rem|em|vw|vh)$/;
const NUMBER = /^\d+(\.\d+)?$/;

function len(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return LENGTH.test(trimmed) ? trimmed : fallback;
}

function unitless(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return NUMBER.test(trimmed) ? trimmed : fallback;
}

function tracking(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return /^-?\d+(\.\d+)?(em|px|rem)$/.test(trimmed) ? trimmed : fallback;
}

function weight(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 900 ? parsed : fallback;
}

const TRANSFORMS = new Set(['none', 'uppercase', 'lowercase', 'capitalize']);

/**
 * Injects the admin-configured palette, typography and layout tokens as CSS
 * custom properties, and requests exactly the Google Font families and weights
 * the settings actually use — never the whole catalogue.
 *
 * Everything downstream (Tailwind tokens, CMS section design, buttons) reads
 * these, so changing a value in the admin repaints the site with no code change.
 */
export function BrandStyle({ settings }: { settings: WebsiteSettings }) {
  const headingWeight = weight(settings.headingWeight, 700);
  const bodyWeight = weight(settings.bodyWeight, 400);
  const navWeight = weight(settings.navWeight, 500);
  const buttonWeight = weight(settings.buttonWeight, 600);

  // An empty nav/button font inherits the body font rather than requesting another file.
  const navFamily = settings.navFont?.trim() || settings.bodyFont;
  const buttonFamily = settings.buttonFont?.trim() || settings.bodyFont;

  const fontHref = googleFontsHref([
    { family: settings.headingFont, weights: [headingWeight, 600, 700].map((w) => nearestWeight(settings.headingFont, w)) },
    { family: settings.bodyFont, weights: [bodyWeight, 500, 600].map((w) => nearestWeight(settings.bodyFont, w)) },
    { family: navFamily, weights: [navWeight] },
    { family: buttonFamily, weights: [buttonWeight] },
  ]);

  const baseSize = len(settings.baseFontSize, '16px');
  const tabletSize = len(settings.baseFontSizeTablet, '');
  const mobileSize = len(settings.baseFontSizeMobile, '');
  const transform = TRANSFORMS.has(settings.buttonTextTransform) ? settings.buttonTextTransform : 'none';

  const root = `:root{
--brand-primary:${rgbTriple(settings.colorPrimary, '0 97 255')};
--brand-secondary:${rgbTriple(settings.colorSecondary, '11 27 52')};
--brand-accent1:${rgbTriple(settings.colorAccent1, '26 193 165')};
--brand-accent2:${rgbTriple(settings.colorAccent2, '255 138 61')};
--brand-background:${rgbTriple(settings.colorBackground, '255 255 255')};
--brand-text:${rgbTriple(settings.colorText, '11 27 52')};
--brand-muted:${rgbTriple(settings.colorMuted, '91 107 133')};
--brand-border:${rgbTriple(settings.colorBorder, '227 232 240')};
--font-heading:${fontStack(settings.headingFont)};
--font-body:${fontStack(settings.bodyFont)};
--font-nav:${fontStack(navFamily)};
--font-button:${fontStack(buttonFamily)};
--font-heading-weight:${headingWeight};
--font-body-weight:${bodyWeight};
--font-nav-weight:${navWeight};
--font-button-weight:${buttonWeight};
--font-base-size:${baseSize};
--font-heading-leading:${unitless(settings.headingLineHeight, '1.15')};
--font-body-leading:${unitless(settings.bodyLineHeight, '1.6')};
--font-heading-tracking:${tracking(settings.headingLetterSpacing, '-0.02em')};
--font-body-tracking:${tracking(settings.bodyLetterSpacing, '0em')};
--font-nav-size:${len(settings.navFontSize, '0.9375rem')};
--font-button-size:${len(settings.buttonFontSize, '0.875rem')};
--font-heading-scale:${unitless(settings.headingScale, '1')};
--layout-container:${len(settings.containerWidth, '72rem')};
--layout-gutter:${len(settings.containerPadding, '1.5rem')};
--layout-section-spacing:${len(settings.sectionSpacing, '5rem')};
--layout-section-spacing-mobile:${len(settings.sectionSpacingMobile, '3rem')};
--layout-radius:${len(settings.borderRadius, '0.75rem')};
--layout-card-radius:${len(settings.cardRadius, '1rem')};
--btn-radius:${len(settings.buttonRadius, '0.5rem')};
--btn-padding-x:${len(settings.buttonPaddingX, '1.25rem')};
--btn-padding-y:${len(settings.buttonPaddingY, '0.625rem')};
--btn-transform:${transform};
}`;

  const responsive = [
    tabletSize
      ? `@media (max-width:1023px){:root{--font-base-size:${tabletSize};${
          unitless(settings.headingScaleTablet, '') ? `--font-heading-scale:${settings.headingScaleTablet.trim()};` : ''
        }}}`
      : unitless(settings.headingScaleTablet, '')
        ? `@media (max-width:1023px){:root{--font-heading-scale:${settings.headingScaleTablet.trim()};}}`
        : '',
    mobileSize
      ? `@media (max-width:767px){:root{--font-base-size:${mobileSize};${
          unitless(settings.headingScaleMobile, '') ? `--font-heading-scale:${settings.headingScaleMobile.trim()};` : ''
        }}}`
      : unitless(settings.headingScaleMobile, '')
        ? `@media (max-width:767px){:root{--font-heading-scale:${settings.headingScaleMobile.trim()};}}`
        : '',
  ]
    .filter(Boolean)
    .join('');

  return (
    <>
      {fontHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontHref} />
        </>
      ) : null}
      {/*
        * The header and footer's own variables, after the palette so they can
        * be expressed in terms of it later if that is ever wanted. Empty when
        * nobody has set any, which is the point: the chrome keeps whatever it
        * looked like before this screen existed.
        */}
      <style
        dangerouslySetInnerHTML={{
          // The Primary and Secondary button designs: empty until one is set.
          __html: root + responsive + chromeStylesheet(settings) + buttonStylesheet(settings),
        }}
      />
    </>
  );
}
