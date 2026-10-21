import type * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { safeUrl } from '@/lib/utils/sanitize';
import { resolveColumns } from '@/lib/cms/design';
import { getMediaByIds } from '@/lib/services/media';
import { getPublicProductsByIds } from '@/lib/services/products';
import type { ProductShowcaseContent } from '@/lib/cms/showcase-blocks';
import { resolveShowcaseTiles, showcaseLookups, type ShowcaseTile } from '@/lib/cms/showcase-resolve';
import { SectionHeading, type BlockContext } from './shared';

/**
 * Product Showcase.
 *
 * Loads only what the tiles need — the products they follow in this market and
 * the images chosen for them — and leaves every decision about a tile to
 * `resolveShowcaseTiles`. Styling is carried as CSS variables on the grid and
 * on a tile with its own style (see `.psc-*` in globals.css): the five styles
 * are classes, and every colour, size and spacing an administrator sets
 * overrides them without generating classes.
 */

const SHADOW: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgb(15 23 42 / 0.05), 0 1px 3px rgb(15 23 42 / 0.07)',
  md: '0 6px 18px rgb(15 23 42 / 0.08)',
  lg: '0 16px 40px rgb(15 23 42 / 0.12)',
};

const IMAGE_RADIUS: Record<ProductShowcaseContent['imageShape'], string> = {
  rounded: '10px',
  square: '0px',
  circle: '9999px',
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

/** Sets a CSS variable only when it has a value, so the style's own values still apply. */
function vars(entries: Record<string, string | number | null | undefined>): Vars {
  const out: Vars = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === '' || value === null || value === undefined) continue;
    (out as Record<string, string | number>)[key] = value;
  }
  return out;
}

export async function ProductShowcaseBlock({
  content,
  ctx,
}: {
  content: ProductShowcaseContent;
  ctx: BlockContext;
}) {
  const { productIds, mediaIds } = showcaseLookups(content);
  const [products, media] = await Promise.all([
    getPublicProductsByIds(ctx.country, productIds),
    getMediaByIds(mediaIds),
  ]);
  const tiles = resolveShowcaseTiles(content, products, media);

  const showIntro = content.showIntro && Boolean(content.eyebrow || content.heading || content.description);
  const footnote = content.footnote.trim();
  if (tiles.length === 0 && !showIntro) return null;

  const compact = content.style === 'card' || content.style === 'list';
  const desktop = content.columns;
  const columns = resolveColumns(ctx.design, desktop, {
    tablet: content.tabletColumns || Math.min(desktop, content.style === 'list' ? 2 : 3),
    mobile: content.mobileColumns || (compact ? 1 : 2),
  });

  const gridStyle = vars({
    '--grid-cols': columns.desktop,
    '--grid-cols-tablet': columns.tablet,
    '--grid-cols-mobile': columns.mobile,
    '--psc-col-gap': content.columnGap,
    '--psc-row-gap': content.rowGap,
    '--psc-max-w': content.gridMaxWidth,
    '--psc-bg': content.cardBackground,
    '--psc-border-color': content.cardBorderColor,
    '--psc-border-w': content.cardBorderWidth,
    '--psc-radius': content.cardRadius,
    '--psc-pad': content.cardPadding,
    '--psc-min-h': content.cardMinHeight,
    '--psc-shadow': content.cardShadow ? SHADOW[content.cardShadow] : '',
    '--psc-name-color': content.nameColor,
    '--psc-name-size': content.nameSize,
    '--psc-name-weight': content.nameWeight,
    '--psc-text': content.textColor,
    '--psc-accent': content.accentColor,
    '--psc-badge-bg': content.badgeBg,
    '--psc-badge-text': content.badgeText,
    '--psc-hover-border': content.hoverBorderColor,
    '--psc-hover-bg': content.hoverBackground,
    '--psc-hover-text': content.hoverTextColor,
    '--psc-img-size': content.imageSize,
    '--psc-img-radius': IMAGE_RADIUS[content.imageShape],
    '--psc-img-fit': content.imageFit,
  });

  return (
    <>
      {showIntro ? (
        <SectionHeading
          eyebrow={content.eyebrow}
          heading={content.heading}
          description={content.description}
          align={content.align}
          inverted={ctx.inverted}
          as={ctx.isFirst ? 'h1' : 'h2'}
          className="mb-10"
        />
      ) : null}

      {tiles.length > 0 ? (
        <ul
          className={cn(
            'psc-grid',
            `psc--${content.style}`,
            `psc-hover--${content.hoverEffect}`,
            content.textAlign === 'center' ? 'psc-align-center' : 'psc-align-left',
            content.equalHeight && 'psc-grid--equal',
            ctx.inverted && 'psc-inverted',
            content.gridAlign === 'left' && 'mr-auto',
            content.gridAlign === 'center' && 'mx-auto',
            content.gridAlign === 'right' && 'ml-auto',
          )}
          style={gridStyle}
          role="list"
        >
          {tiles.map((tile) => (
            <li key={tile.id} className="psc-item">
              <Tile tile={tile} showArrow={content.showArrow} />
            </li>
          ))}
        </ul>
      ) : null}

      {footnote ? (
        <p
          className={cn(
            'mx-auto mt-8 max-w-3xl whitespace-pre-line text-sm leading-relaxed',
            content.align === 'center' ? 'text-center' : 'text-left',
            ctx.inverted ? 'text-white/75' : 'text-muted',
          )}
        >
          {footnote}
        </p>
      ) : null}
    </>
  );
}

function Tile({ tile, showArrow }: { tile: ShowcaseTile; showArrow: boolean }) {
  const href = tile.href ? safeUrl(tile.href) : null;
  const style = tile.style
    ? vars({
        '--psc-bg': tile.style.background,
        '--psc-border-color': tile.style.borderColor,
        '--psc-name-color': tile.style.textColor,
        '--psc-text': tile.style.textColor,
      })
    : undefined;

  const body = (
    <>
      {tile.badge ? <span className="psc-badge">{tile.badge}</span> : null}
      {tile.image ? (
        <span className="psc-media">
          <Image
            src={tile.image.url}
            alt={tile.image.alt}
            width={tile.image.width ?? 320}
            height={tile.image.height ?? 320}
            sizes="(max-width: 768px) 50vw, 240px"
            loading="lazy"
            className="psc-img"
          />
        </span>
      ) : null}
      <span className="psc-body">
        <span className="psc-name">
          {tile.name}
          {href && showArrow ? <ArrowUpRight className="psc-arrow" aria-hidden="true" /> : null}
        </span>
        {tile.description ? <span className="psc-text">{tile.description}</span> : null}
      </span>
    </>
  );

  if (!href) {
    return (
      <div className={cn('psc-tile', tile.image && 'psc-tile--image')} style={style}>
        {body}
      </div>
    );
  }

  const external = /^https?:\/\//i.test(href);
  const newTab = tile.newTab || false;
  return (
    <Link
      href={href}
      className={cn('psc-tile psc-tile--link', tile.image && 'psc-tile--image')}
      style={style}
      {...(newTab ? { target: '_blank', rel: external ? 'noopener noreferrer' : 'noopener' } : {})}
    >
      {body}
      {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </Link>
  );
}
