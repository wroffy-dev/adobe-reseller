import type * as React from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { cn } from '@/lib/utils/cn';
import { safeUrl, sanitizeHtml } from '@/lib/utils/sanitize';
import { buttonClasses, type ButtonVariant } from '@/components/ui/button';
import type { ButtonRole } from '@/lib/cms/buttons';
import type { ResolvedMedia } from '@/lib/services/media';
import type { SectionDesign } from '@/lib/cms/design';
import { resolveColumns, gridStyle } from '@/lib/cms/design';
import type { BlogRenderContext } from '@/lib/cms/blog-render';
import type { ProductRenderContext } from '@/lib/cms/product-render';
import type { CountryContext } from '@/lib/country/types';

/**
 * Context every block receives from the section renderer.
 *
 * Blocks never read `PageSection.settings` themselves — the renderer resolves
 * the design once and hands down only what a block can act on.
 */
export type BlockContext = {
  /**
   * The row this block is being rendered from.
   *
   * Blocks that mint a DOM id — a heading a `aria-labelledby` points at —
   * build it from this rather than from a constant, so two copies of the same
   * block on one page do not share one id.
   */
  sectionId: string;
  /**
   * The market this section is being rendered for.
   *
   * Blocks read it instead of building market-aware URLs themselves: the
   * section renderer has already rewritten the stored content's internal links,
   * so a block only needs it for the links it generates from data (a product,
   * an article, a category archive).
   */
  country: CountryContext;
  /** The section paints a dark surface, so content must invert. */
  inverted: boolean;
  /** First section on the page — its heading becomes the <h1>. */
  isFirst: boolean;
  design: SectionDesign;
  /**
   * Present only on blog surfaces. It carries the blog's settings and the
   * archive or article being rendered, so a blog block never has to query for
   * the page it happens to be on.
   */
  blog?: BlogRenderContext;
  /**
   * Present only on product surfaces. It carries the product being rendered,
   * its gallery and the catalogue's design settings, so a product block never
   * has to query for the product it happens to be on.
   */
  product?: ProductRenderContext;
};

/**
 * Grid variables for a block that carries its own per-breakpoint counts.
 *
 * The block says what it wants at each width and the design panel's Responsive
 * tab overrides it, so the common case is one place and the exception is still
 * the section's own.
 */
export function blockColumnVars(
  design: SectionDesign,
  content: { columns?: number; tabletColumns?: number; mobileColumns?: number },
  fallback = 3,
): Record<string, string> {
  return columnVars(design, content.columns || fallback, {
    tablet: content.tabletColumns || undefined,
    mobile: content.mobileColumns || undefined,
  });
}

/** CSS variables for a responsive card grid, design panel taking precedence. */
export function columnVars(
  design: SectionDesign,
  blockColumns: number,
  fallback?: { tablet?: number; mobile?: number },
): Record<string, string> {
  return gridStyle(resolveColumns(design, blockColumns, fallback));
}

export function SectionHeading({
  eyebrow,
  heading,
  description,
  align = 'center',
  inverted,
  className,
  as: Tag = 'h2',
  headingStyle,
  descriptionStyle,
}: {
  eyebrow?: string | null;
  heading?: string | null;
  description?: string | null;
  align?: 'left' | 'center' | 'right';
  inverted?: boolean;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
  /** Explicit colours from a block's own design controls, when set. */
  headingStyle?: React.CSSProperties;
  descriptionStyle?: React.CSSProperties;
}) {
  if (!eyebrow && !heading && !description) return null;
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        align === 'right' && 'ml-auto text-right',
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'mb-3 text-xs font-semibold uppercase tracking-[0.14em]',
            inverted ? 'text-white/70' : 'cms-accent',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      {heading ? (
        <Tag
          className={cn(
            'font-heading tracking-tight',
            Tag === 'h1' ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl lg:text-4xl',
            inverted ? 'text-white' : 'text-content',
          )}
          style={headingStyle}
        >
          {heading}
        </Tag>
      ) : null}
      {description ? (
        <p
          className={cn(
            'mt-4 text-base leading-relaxed sm:text-lg',
            inverted ? 'text-white/80' : 'text-muted',
          )}
          style={descriptionStyle}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The variant a block's main call to action is drawn in.
 *
 * On a dark section the main button has always been an outline, so it reads
 * against the background. A section that chose its own Button colour gets a
 * filled button in that colour instead. `dark` defaults to the section's own
 * darkness; a block that paints a dark surface of its own — a backdrop hero,
 * the CTA's brand panel — passes it.
 */
export function mainCtaVariant(ctx: BlockContext, dark: boolean = ctx.inverted): 'primary' | 'outline' {
  return dark && !ctx.design.colors.button ? 'outline' : 'primary';
}

/**
 * Renders a CTA only when both a label and a safe URL are present.
 *
 * Primary and outline buttons pick up the section's own button colour through
 * the `cms-btn-*` classes, so a section can restyle its buttons without code.
 */
export function CtaLink({
  label,
  url,
  variant = 'primary',
  size = 'lg',
  className,
  role,
}: {
  label?: string | null;
  url?: string | null;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * The Website Design role, when it is not the variant's own: a block's main
   * call to action passes "primary", so it takes the Primary button design
   * even where a dark section draws it as an outline.
   */
  role?: ButtonRole;
}) {
  const href = safeUrl(url);
  if (!label?.trim() || !href) return null;
  const external = /^https?:\/\//i.test(href);
  // btn-tokens applies the global button radius/padding/type from Website design;
  // cms-btn-* lets a section override the colour on top of that.
  const tone = cn(
    'btn-tokens',
    variant === 'primary' && 'cms-btn-primary',
    variant === 'outline' && 'cms-btn-outline',
    variant === 'ghost' && 'cms-btn-ghost',
  );
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, cn(tone, className), role)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </Link>
  );
}

/** Sanitised rich text from the CMS. */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return <div className={cn('prose-cms', className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function gridColsClass(columns: number): string {
  return (
    {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    }[columns] ?? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  );
}

const RATIO_STYLE: Record<string, string | undefined> = {
  auto: undefined,
  '1/1': '1 / 1',
  '4/3': '4 / 3',
  '3/2': '3 / 2',
  '16/9': '16 / 9',
  '3/4': '3 / 4',
  '2/3': '2 / 3',
};

export type CmsImageProps = {
  media: ResolvedMedia | null;
  alt?: string;
  ratio?: string;
  fit?: string;
  position?: string;
  width?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  wrapperClassName?: string;
  /** Renders a dashed placeholder when no image is chosen. */
  placeholder?: boolean;
};

/**
 * Admin-configured image.
 *
 * Ratio, fit, focal point and width all come from the section's content, and the
 * responsive width/height set in the design panel arrive as `--sec-img-*`.
 */
export function CmsImage({
  media,
  alt,
  ratio = 'auto',
  fit = 'cover',
  position = 'center',
  width,
  sizes = '(max-width: 1024px) 100vw, 50vw',
  priority = false,
  className,
  wrapperClassName,
  placeholder = false,
}: CmsImageProps) {
  const aspect = RATIO_STYLE[ratio];

  if (!media) {
    if (!placeholder) return null;
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-dashed border-hairline bg-muted/5',
          wrapperClassName,
        )}
        style={{ aspectRatio: aspect ?? '4 / 3', width: width || undefined }}
        aria-hidden="true"
      />
    );
  }

  const objectFit = ['cover', 'contain', 'fill', 'none'].includes(fit) ? fit : 'cover';

  return (
    <div
      className={cn('cms-media relative overflow-hidden', wrapperClassName)}
      style={{ aspectRatio: aspect, width: width || undefined }}
    >
      <NextImage
        src={media.url}
        alt={alt?.trim() || media.altText || ''}
        {...(aspect ? { fill: true } : { width: media.width ?? 1200, height: media.height ?? 800 })}
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        className={cn(aspect ? 'absolute inset-0 h-full w-full' : 'h-auto w-full', className)}
        style={{ objectFit: objectFit as 'cover', objectPosition: position }}
      />
    </div>
  );
}

const ICON_BADGE: Record<string, string> = {
  circle: 'rounded-full',
  square: 'rounded-lg',
  plain: '',
};

/** Icon presentation shared by the icon cards, icon box and list blocks. */
export function IconBadge({
  children,
  style = 'circle',
  size,
  inverted,
  className,
}: {
  children: React.ReactNode;
  style?: string;
  size?: string;
  inverted?: boolean;
  className?: string;
}) {
  const badge = ICON_BADGE[style] ?? 'rounded-full';
  const box = size || '2.75rem';
  if (style === 'plain') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        style={{ width: box, height: box }}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        badge,
        inverted ? 'bg-white/15 text-white' : 'bg-brand/10 cms-accent',
        className,
      )}
      style={{ width: box, height: box }}
    >
      {children}
    </span>
  );
}

/** Optional wrapper that turns a whole card into a link when a URL is set. */
export function MaybeLink({
  url,
  className,
  children,
}: {
  url?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const href = safeUrl(url);
  if (!href) return <div className={className}>{children}</div>;
  const external = /^https?:\/\//i.test(href);
  return (
    <Link
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </Link>
  );
}
