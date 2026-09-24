import NextImage from 'next/image';
import { Star } from 'lucide-react';
import { getMediaByIds, type ResolvedMedia } from '@/lib/services/media';
import { readSliderSettings } from '@/lib/cms/slider';
import type {
  LogoSliderContent,
  ImageSliderContent,
  TestimonialSliderContent,
  ContentSliderContent,
  TextBoxSliderContent,
  ProductSliderContent,
  BlogSliderContent,
} from '@/lib/cms/slider-blocks';
import { selectProducts } from '@/lib/services/products';
import { resolvePostSource } from '@/lib/services/blog';
import { getBlogSettings } from '@/lib/services/blog-cms';
import { resolveCard } from '@/lib/cms/blog-render';
import { ProductCard } from '@/components/products/product-card';
import { getProductSettings } from '@/lib/services/product-cms';
import { productCardVars, productImageVars } from '@/lib/cms/product-settings';
import { PostCard } from '@/components/blog/post-card';
import { safeUrl } from '@/lib/utils/sanitize';
import { cn } from '@/lib/utils/cn';
import { SectionHeading, CtaLink, type BlockContext, ctaVisible } from './shared';
import { SliderCore } from './slider-core';

/**
 * The slider sections.
 *
 * Each of these is a Server Component: it resolves its media, renders its
 * slides as plain HTML, and hands them to `SliderCore` as children. The only
 * JavaScript that reaches the browser is the one slider — a section of twelve
 * cards ships twelve cards of markup and no per-card script.
 */

/** Media for every id a block references, in one query. */
async function resolveMedia(ids: Array<string | null | undefined>) {
  return getMediaByIds(ids.filter((id): id is string => Boolean(id)));
}

/** Items an editor has switched off never render. */
function visible<T extends { enabled?: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.enabled !== false);
}

const RATIO: Record<string, string | undefined> = {
  auto: undefined,
  '1/1': '1 / 1',
  '4/3': '4 / 3',
  '3/2': '3 / 2',
  '16/9': '16 / 9',
  '3/4': '3 / 4',
};

/**
 * A slide image.
 *
 * Width and height always come from the stored dimensions, and the box has an
 * aspect ratio, so the space is reserved before the file arrives and the track
 * does not jump as slides load. Nothing here is eager: a slider is below the
 * fold far more often than not, and `loading="lazy"` is what Next gives by
 * default — only the fetch priority of a first-section slider is raised.
 */
function SlideImage({
  media,
  alt,
  ratio,
  fit,
  className,
  priority,
}: {
  media: ResolvedMedia | undefined;
  alt: string;
  ratio?: string;
  fit: 'cover' | 'contain';
  className?: string;
  priority?: boolean;
}) {
  if (!media) return null;
  return (
    <NextImage
      src={media.url}
      alt={alt || media.altText || ''}
      width={media.width ?? 1200}
      height={media.height ?? 800}
      sizes="(max-width: 767px) 90vw, (max-width: 1023px) 45vw, 30vw"
      priority={priority}
      className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', className)}
      style={ratio ? { aspectRatio: ratio } : undefined}
    />
  );
}

// --- logo slider ------------------------------------------------------------
export async function LogoSliderBlock({
  content,
  ctx,
}: {
  content: LogoSliderContent;
  ctx: BlockContext;
}) {
  const items = visible(content.items);
  const media = await resolveMedia(items.map((item) => item.imageId));
  const settings = readSliderSettings(content);
  if (items.length === 0) return null;

  return (
    <>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
        className="mb-8"
      />
      <SliderCore settings={settings} label={content.heading || 'Logos'}>
        {items.map((item, index) => {
          const image = item.imageId ? media.get(item.imageId) : undefined;
          const href = safeUrl(item.url);
          const body = (
            <span
              className={cn(
                'flex h-full w-full items-center justify-center',
                content.hoverLift && 'transition-transform hover:-translate-y-0.5',
              )}
              style={{ height: `${content.logoHeight}px` }}
            >
              {image ? (
                <NextImage
                  src={image.url}
                  alt={item.alt || item.title || image.altText || ''}
                  width={image.width ?? 240}
                  height={image.height ?? content.logoHeight}
                  className={cn(
                    'max-h-full w-auto',
                    content.logoFit === 'cover' ? 'object-cover' : 'object-contain',
                    content.grayscale && 'grayscale transition-[filter] hover:grayscale-0',
                  )}
                />
              ) : (
                <span className="text-sm font-medium opacity-70">{item.title}</span>
              )}
            </span>
          );

          return href ? (
            <a
              key={index}
              href={href}
              target={item.newTab ? '_blank' : undefined}
              rel={item.newTab ? 'noopener noreferrer' : undefined}
              title={item.title || undefined}
              className="admin-focus flex h-full items-center justify-center rounded-lg p-2"
            >
              {body}
            </a>
          ) : (
            <div key={index} className="flex h-full items-center justify-center p-2">
              {body}
            </div>
          );
        })}
      </SliderCore>
    </>
  );
}

// --- image slider -----------------------------------------------------------
export async function ImageSliderBlock({
  content,
  ctx,
}: {
  content: ImageSliderContent;
  ctx: BlockContext;
}) {
  const items = visible(content.items);
  const media = await resolveMedia(items.map((item) => item.imageId));
  const settings = readSliderSettings(content);
  if (items.length === 0) return null;

  const overlayPosition: Record<string, string> = {
    bottomLeft: 'items-end justify-start text-left',
    bottomCentre: 'items-end justify-center text-center',
    centre: 'items-center justify-center text-center',
    topLeft: 'items-start justify-start text-left',
  };

  return (
    <>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
        className="mb-8"
      />
      <SliderCore settings={settings} label={content.heading || 'Images'}>
        {items.map((item, index) => {
          const image = item.imageId ? media.get(item.imageId) : undefined;
          const below = content.contentPosition === 'below';
          const hasText = Boolean(item.heading || item.description || item.buttonLabel);

          const caption = hasText ? (
            <div className={cn(below ? 'mt-3' : 'relative z-10 p-5')}>
              {item.heading ? (
                <h3 className="font-heading text-lg font-semibold">{item.heading}</h3>
              ) : null}
              {item.description ? (
                <p className="mt-1.5 text-sm opacity-85">{item.description}</p>
              ) : null}
              {ctaVisible(item.buttonLabel, item.buttonUrl) ? (
                <div
                  className={cn(
                    'cms-actions mt-3',
                    !below &&
                      (content.contentPosition === 'centre' ||
                        content.contentPosition === 'bottomCentre') &&
                      'justify-center',
                  )}
                >
                  <CtaLink label={item.buttonLabel} url={item.buttonUrl} size="sm" />
                </div>
              ) : null}
            </div>
          ) : null;

          return (
            <figure key={index} className="m-0 h-full">
              <div
                className={cn('relative overflow-hidden', !below && hasText && 'flex')}
                style={{ borderRadius: `${content.radius}px` }}
              >
                <SlideImage
                  media={image}
                  alt={item.alt}
                  ratio={RATIO[content.ratio]}
                  fit={content.fit}
                  priority={ctx.isFirst && index === 0}
                />
                {!below && hasText ? (
                  <>
                    {content.overlay ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-black to-transparent"
                        style={{ opacity: content.overlayOpacity / 100 }}
                      />
                    ) : null}
                    <figcaption
                      className={cn(
                        'absolute inset-0 flex text-white',
                        overlayPosition[content.contentPosition] ?? overlayPosition.bottomLeft,
                      )}
                    >
                      {caption}
                    </figcaption>
                  </>
                ) : null}
              </div>
              {below ? <figcaption>{caption}</figcaption> : null}
            </figure>
          );
        })}
      </SliderCore>
    </>
  );
}

const CARD_STYLE: Record<string, string> = {
  bordered: 'cms-surface border border-hairline bg-surface',
  filled: 'bg-muted/[0.05]',
  plain: '',
};

// --- testimonial slider -----------------------------------------------------
export async function TestimonialSliderBlock({
  content,
  ctx,
}: {
  content: TestimonialSliderContent;
  ctx: BlockContext;
}) {
  const items = visible(content.items);
  const media = await resolveMedia(items.flatMap((item) => [item.imageId, item.companyLogoId]));
  const settings = readSliderSettings(content);
  if (items.length === 0) return null;

  return (
    <>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
        className="mb-8"
      />
      <SliderCore settings={settings} label={content.heading || 'Testimonials'}>
        {items.map((item, index) => {
          const photo = item.imageId ? media.get(item.imageId) : undefined;
          const logo = item.companyLogoId ? media.get(item.companyLogoId) : undefined;
          return (
            <figure
              key={index}
              className={cn(
                'm-0 flex h-full flex-col',
                CARD_STYLE[content.cardStyle],
                content.shadow && 'shadow-sm',
                content.textAlign === 'center' && 'text-center',
              )}
              style={{ borderRadius: `${content.radius}px`, padding: `${content.cardPadding}px` }}
            >
              {content.showRating && item.rating > 0 ? (
                <div
                  className={cn('mb-3 flex gap-0.5', content.textAlign === 'center' && 'justify-center')}
                  aria-label={`Rated ${item.rating} out of 5`}
                >
                  {Array.from({ length: 5 }).map((_, star) => (
                    <Star
                      key={star}
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-4',
                        star < item.rating ? 'fill-current text-amber-500' : 'opacity-25',
                      )}
                    />
                  ))}
                </div>
              ) : null}

              <blockquote className="flex-1 text-sm leading-relaxed opacity-90">
                {item.quote}
              </blockquote>

              <figcaption
                className={cn(
                  'mt-4 flex items-center gap-3',
                  content.textAlign === 'center' && 'justify-center',
                )}
              >
                {content.showAvatar && photo ? (
                  <NextImage
                    src={photo.url}
                    alt={photo.altText || item.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block truncate text-xs opacity-70">
                    {[item.designation, item.company].filter(Boolean).join(', ')}
                  </span>
                </span>
                {logo ? (
                  <NextImage
                    src={logo.url}
                    alt={logo.altText || item.company}
                    width={72}
                    height={24}
                    className="ml-auto h-6 w-auto shrink-0 object-contain opacity-70"
                  />
                ) : null}
              </figcaption>
            </figure>
          );
        })}
      </SliderCore>
    </>
  );
}

// --- image + heading + text slider ------------------------------------------
export async function ContentSliderBlock({
  content,
  ctx,
}: {
  content: ContentSliderContent;
  ctx: BlockContext;
}) {
  const items = visible(content.items);
  const media = await resolveMedia(items.map((item) => item.imageId));
  const settings = readSliderSettings(content);
  if (items.length === 0) return null;

  const side = content.layout === 'imageLeft' || content.layout === 'imageRight';
  const background = content.layout === 'backgroundImage';

  return (
    <>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
        className="mb-8"
      />
      <SliderCore settings={settings} label={content.heading || 'Slides'}>
        {items.map((item, index) => {
          const image = item.imageId ? media.get(item.imageId) : undefined;
          const text = (
            <div className={cn('min-w-0', background && 'relative z-10 p-6 text-white')}>
              {item.heading ? (
                <h3 className="font-heading text-lg font-semibold">{item.heading}</h3>
              ) : null}
              {item.description ? (
                <p className="mt-2 text-sm leading-relaxed opacity-85">{item.description}</p>
              ) : null}
              {item.bullets.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-sm opacity-85">
                  {item.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span className="min-w-0">{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {ctaVisible(item.ctaLabel, item.ctaUrl) ? (
                <div className="cms-actions mt-4">
                  <CtaLink label={item.ctaLabel} url={item.ctaUrl} size="sm" />
                </div>
              ) : null}
            </div>
          );

          const picture = image ? (
            <div
              className={cn('overflow-hidden', side ? 'w-2/5 shrink-0' : 'w-full')}
              style={{ borderRadius: `${content.radius}px` }}
            >
              <SlideImage
                media={image}
                alt={item.alt}
                ratio={RATIO[content.ratio]}
                fit="cover"
                priority={ctx.isFirst && index === 0}
              />
            </div>
          ) : null;

          if (background) {
            return (
              <article
                key={index}
                className="relative flex h-full items-end overflow-hidden"
                style={{ borderRadius: `${content.radius}px` }}
              >
                {image ? (
                  <span className="absolute inset-0">
                    <SlideImage media={image} alt={item.alt} ratio={RATIO[content.ratio]} fit="cover" />
                    <span aria-hidden="true" className="absolute inset-0 bg-black/50" />
                  </span>
                ) : null}
                {text}
              </article>
            );
          }

          return (
            <article
              key={index}
              className={cn(
                'flex h-full gap-4',
                // Side-by-side on a tablet and up, stacked on a phone, with no
                // extra control to configure: a 40% image column at 375px is
                // not a layout anyone wants.
                side ? 'flex-col sm:flex-row' : 'flex-col',
                content.layout === 'imageRight' && 'sm:flex-row-reverse',
              )}
            >
              {picture}
              {text}
            </article>
          );
        })}
      </SliderCore>
    </>
  );
}

// --- text box / city slider -------------------------------------------------
export async function TextBoxSliderBlock({
  content,
  ctx,
}: {
  content: TextBoxSliderContent;
  ctx: BlockContext;
}) {
  const items = visible(content.items);
  const media = await resolveMedia(items.map((item) => item.imageId));
  const settings = readSliderSettings(content);
  if (items.length === 0) return null;

  return (
    <>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
        className="mb-8"
      />
      <SliderCore settings={settings} label={content.heading || 'Cards'}>
        {items.map((item, index) => {
          const image = item.imageId ? media.get(item.imageId) : undefined;
          const href = safeUrl(item.url);
          return (
            <article
              key={index}
              className={cn(
                'flex h-full flex-col',
                CARD_STYLE[content.cardStyle],
                content.shadow && 'shadow-sm',
                content.textAlign === 'center' && 'text-center',
              )}
              style={{ borderRadius: `${content.radius}px`, padding: `${content.cardPadding}px` }}
            >
              {image ? (
                <div
                  className="mb-3 overflow-hidden"
                  style={{ borderRadius: `${Math.max(0, content.radius - 4)}px` }}
                >
                  <SlideImage media={image} alt={item.heading} ratio="16 / 9" fit="cover" />
                </div>
              ) : null}
              {item.heading ? (
                <h3 className="font-heading text-base font-semibold">{item.heading}</h3>
              ) : null}
              {item.text ? (
                <p className="mt-1.5 flex-1 text-sm leading-relaxed opacity-80">{item.text}</p>
              ) : null}
              {href ? (
                <a
                  href={href}
                  target={item.newTab ? '_blank' : undefined}
                  rel={item.newTab ? 'noopener noreferrer' : undefined}
                  className="admin-focus mt-3 inline-flex text-sm font-medium text-brand underline-offset-2 hover:underline"
                >
                  {item.ctaLabel || 'View details'}
                </a>
              ) : null}
            </article>
          );
        })}
      </SliderCore>
    </>
  );
}

/**
 * Products on a track.
 *
 * It runs the same `selectProducts` the product grid and comparison table run,
 * with the same source settings, so a plan's market ordering, its featured
 * order and a hand-picked arrangement are identical whichever section an
 * administrator reaches for. The card is the same `ProductCard` too — one
 * pricing card in this codebase, not a slider-shaped copy of it.
 */
export async function ProductSliderBlock({
  content,
  ctx,
}: {
  content: ProductSliderContent;
  ctx: BlockContext;
}) {
  const settings = readSliderSettings(content);
  const products = await selectProducts(ctx.country, {
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    limit: content.limit,
  });

  if (products.length === 0) return null;

  /*
   * The catalogue's card and image settings travel with the slides, the same
   * way they do for a product grid — every variable falls back to the card's
   * original value, so an untouched site is unchanged.
   */
  const design = await getProductSettings();

  return (
    <div
      className="space-y-8"
      style={
        {
          ...productCardVars(design.card),
          ...productImageVars(design.image),
        } as React.CSSProperties
      }
    >
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
      />
      <SliderCore
        settings={settings}
        label={content.heading || 'Products'}
        slideClassName="flex"
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            billing={content.billing}
            ctaLabel={content.ctaLabel || undefined}
            showImage={content.showImage}
            showDescription={content.showDescription}
            showPrice={content.showPrice}
            showFeatures={content.showFeatures}
            showBenefits={content.showBenefits}
            showSpecs={content.showSpecs}
            featureLimit={content.featureLimit}
            showName={content.showName}
            linkName={content.linkName}
            showActions={content.showActions}
            showCta={content.showCta}
            showDetailsLink={content.showDetailsLink}
            ctaLocation="product-slider"
            className="w-full"
          />
        ))}
      </SliderCore>
    </div>
  );
}

/**
 * Articles on a track.
 *
 * Offered on ordinary pages as well as the blog, which is why the card
 * settings are read from the blog's own design when the section is not on a
 * blog surface: a "Latest articles" slider on the home page should look like
 * the blog it links into, without the editor configuring a second card style.
 */
export async function BlogSliderBlock({
  content,
  ctx,
}: {
  content: BlogSliderContent;
  ctx: BlockContext;
}) {
  const settings = readSliderSettings(content);
  const posts = await resolvePostSource(ctx.country.id, content, {
    currentPostId: ctx.blog?.article?.post.id ?? null,
    currentCategoryId: ctx.blog?.article?.post.categoryId ?? null,
  });

  if (posts.length === 0) return null;

  const blogSettings = ctx.blog?.settings ?? (await getBlogSettings());
  const card = resolveCard(blogSettings.card, content);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        inverted={ctx.inverted}
        as={ctx.isFirst ? 'h1' : 'h2'}
      />
      <SliderCore
        settings={settings}
        label={content.heading || 'Articles'}
        slideClassName="flex"
      >
        {posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            country={ctx.country}
            card={card}
            // Only a first section's first slide is worth pre-loading; the
            // rest are below the fold or off to the side of the track.
            priority={ctx.isFirst && index === 0}
            className="w-full"
          />
        ))}
      </SliderCore>
    </div>
  );
}
