import type * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import type {
  ProductHeaderContent,
  ProductMediaContent,
  ProductDescriptionContent,
  ProductFeaturesContent,
  ProductSpecsContent,
  ProductRelatedContent,
  ProductPriceBoxContent,
} from '@/lib/cms/product-blocks';
import { RATIO_CSS } from '@/lib/cms/product-settings';
import { selectProducts } from '@/lib/services/products';
import { getPublicForm } from '@/lib/services/forms';
import { formatMoney } from '@/lib/utils/money';
import { countryPath } from '@/lib/country/routing';
import { safeUrl } from '@/lib/utils/sanitize';
import { cn } from '@/lib/utils/cn';
import { ProductCta } from '@/components/products/product-cta';
import { ProductCard } from '@/components/products/product-card';
import { FormPanel } from './form-panel';
import {
  RichText,
  SectionHeading,
  columnVars,
  blockColumnVars,
  type BlockContext,
} from './shared';

/**
 * The blocks a product page is built from.
 *
 * Each reads the product from `ctx.product`, which the product surface
 * resolves once for the whole page. None of them queries for the product they
 * are on, so the same block renders any product — and an administrator can
 * reorder, hide or restyle them like any other section.
 *
 * A block rendered without a product context returns null rather than
 * throwing: these are offered only on product surfaces, but a section row
 * copied elsewhere must not be able to break a page.
 */

/** Image sizing that a section may override, otherwise the design settings. */
function mediaSizing(content: ProductMediaContent, ctx: BlockContext) {
  const image = ctx.product?.settings.image;
  if (content.overrideSize) {
    return {
      maxWidth: content.mainMaxWidth || undefined,
      ratio: RATIO_CSS[content.mainRatio],
      fit: content.mainFit,
      columns: content.galleryColumns,
    };
  }
  return {
    maxWidth: image?.mainMaxWidth || undefined,
    ratio: image ? RATIO_CSS[image.mainRatio] : undefined,
    fit: image?.mainFit ?? 'cover',
    columns: image?.galleryColumns ?? 3,
  };
}

/**
 * A category or brand name, as a link where its page exists.
 *
 * The same element either way, so the eyebrow's spacing and letterspacing do
 * not shift depending on whether a page happens to have been generated.
 */
function TaxonomyName({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <Link href={href} className="underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function ProductHeaderBlock({
  content,
  ctx,
}: {
  content: ProductHeaderContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product, country, categoryHref, brandHref } = productCtx;

  /*
   * A crumb's own destination where one is set, and the built-in one where it
   * is not. `safeUrl` is what keeps a stored value from becoming a
   * `javascript:` link; anything it refuses falls back to the default rather
   * than rendering a crumb that does nothing.
   */
  const homeHref = safeUrl(content.homeUrl) ?? countryPath(country);
  const productsHref = safeUrl(content.productsUrl) ?? countryPath(country, 'pricing');

  // A link only where there is a published page to send anyone to; otherwise
  // the name still shows, as plain text.
  const categoryLink = content.linkCategory ? categoryHref : null;
  const brandLink = content.linkBrand ? brandHref : null;

  const centred = content.align === 'center';
  const withImage = content.showImage && Boolean(product.imageUrl);
  // Centring is a one-column decision; beside an image there is nothing to
  // centre the text against.
  const centredText = centred && !withImage;
  const width = content.imageWidth || '250px';
  /*
   * The element the product name is, chosen per section. Rendered through a
   * variable rather than a switch: the tag is one of six literals the schema
   * already pinned down, so there is nothing here for a stored value to widen.
   */
  const Title = content.titleTag;

  return (
    <header className={cn(centredText && 'text-center')}>
      {content.showBreadcrumb ? (
        <nav aria-label="Breadcrumb">
          <ol
            className={cn(
              'flex flex-wrap items-center gap-1.5 text-xs text-muted',
              centred && 'justify-center',
            )}
          >
            <li>
              <Link href={homeHref} className="hover:text-brand">
                {content.homeLabel || 'Home'}
              </Link>
            </li>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            {content.showProductsCrumb ? (
              <>
                <li>
                  <Link href={productsHref} className="hover:text-brand">
                    {content.productsLabel || 'Products'}
                  </Link>
                </li>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </>
            ) : null}
            <li aria-current="page" className="font-medium text-content">
              {product.name}
            </li>
          </ol>
        </nav>
      ) : null}

      {/*
       * Image and text side by side, and one column on a phone, where two
       * 250px columns would leave neither of them readable. The image is a
       * fixed box rather than a share of the row, so "250px" is 250px whatever
       * the text beside it does.
       */}
      <div
        className={cn(
          withImage && 'mt-6 flex flex-col gap-8 sm:flex-row sm:items-start',
          withImage && content.imagePosition === 'right' && 'sm:flex-row-reverse',
        )}
      >
        {withImage ? (
          <Image
            src={product.imageUrl as string}
            alt={product.imageAlt ?? product.name}
            width={500}
            height={500}
            priority
            sizes={width}
            className={cn('h-auto rounded-lg', content.imageBorder && 'border border-hairline')}
            style={{
              width,
              maxWidth: '100%',
              flex: `0 0 ${width}`,
              aspectRatio: content.imageRatio === 'auto' ? undefined : content.imageRatio,
              objectFit: content.imageFit,
            }}
          />
        ) : null}

        <div className={cn(withImage && 'min-w-0 flex-1')}>
          {(content.showCategory && product.categoryName) ||
          (content.showBrand && product.brandName) ? (
            <p
              className={cn(
                'flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand',
                // Clear of the breadcrumb, but not of the top of its own column.
                !withImage && 'mt-4',
                centredText && 'justify-center',
              )}
            >
              {content.showCategory && product.categoryName ? (
                <TaxonomyName href={categoryLink}>{product.categoryName}</TaxonomyName>
              ) : null}
              {content.showCategory &&
              product.categoryName &&
              content.showBrand &&
              product.brandName ? (
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
              ) : null}
              {content.showBrand && product.brandName ? (
                <TaxonomyName href={brandLink}>{product.brandName}</TaxonomyName>
              ) : null}
            </p>
          ) : null}

          <Title
            className={cn(
              'product-title mt-3 font-heading tracking-tight text-content',
              // The built-in scale, which this section's own size replaces.
              !content.titleSize && 'text-3xl sm:text-4xl lg:text-5xl',
            )}
            style={{
              // The section's size wins; otherwise the design screen's, and
              // then the class above.
              fontSize: content.titleSize || 'var(--product-title-size)',
              fontWeight: 'var(--product-title-weight)' as unknown as number,
              lineHeight: 'var(--product-title-lh)',
              letterSpacing: 'var(--product-title-ls)',
            }}
          >
            {product.name}
          </Title>

          {content.showShortDescription && product.shortDescription ? (
            <p className="mt-4 text-lg leading-relaxed text-muted">{product.shortDescription}</p>
          ) : null}

          {content.showSku && product.sku ? (
            <p className="mt-3 text-xs uppercase tracking-wide text-muted">SKU {product.sku}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function ProductMediaBlock({
  content,
  ctx,
}: {
  content: ProductMediaContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product, gallery } = productCtx;

  const sizing = mediaSizing(content, ctx);
  const images =
    content.galleryLimit > 0 ? gallery.slice(0, content.galleryLimit) : gallery;

  const showMain = content.showMainImage && product.imageUrl;
  const showGallery = content.showGallery && images.length > 0;
  if (!showMain && !showGallery) return null;

  return (
    <div>
      {showMain ? (
        <Image
          src={product.imageUrl as string}
          alt={product.imageAlt ?? product.name}
          width={900}
          height={560}
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="h-auto w-full rounded-2xl border border-hairline"
          style={{
            maxWidth: sizing.maxWidth,
            aspectRatio: sizing.ratio,
            objectFit: sizing.fit,
            borderRadius: 'var(--product-main-image-radius)',
          }}
        />
      ) : null}

      {showGallery ? (
        <ul
          className={cn('cms-grid mt-6', showMain ? '' : 'mt-0')}
          style={{
            /*
             * Thumbnails, so they keep more than one per row on a phone unless
             * the design panel says otherwise — a gallery of full-width
             * thumbnails is just the main image again.
             */
            ...columnVars(ctx.design, sizing.columns, {
              tablet: Math.min(sizing.columns, 3),
              mobile: Math.min(sizing.columns, 2),
            }),
            gap: 'var(--product-gallery-gap, 0.75rem)',
          }}
        >
          {images.map((image) => (
            <li key={image.id}>
              <Image
                src={image.url}
                alt={image.altText}
                width={image.width ?? 400}
                height={image.height ?? 300}
                sizes="(max-width: 640px) 50vw, 240px"
                className="h-auto w-full rounded-lg border border-hairline"
                style={{
                  height: 'var(--product-gallery-height)',
                  aspectRatio: 'var(--product-gallery-ratio)',
                  objectFit: 'var(--product-gallery-fit)' as React.CSSProperties['objectFit'],
                  borderRadius: 'var(--product-gallery-radius)',
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProductDescriptionBlock({
  content,
  ctx,
}: {
  content: ProductDescriptionContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product } = productCtx;

  const html = product.description || (content.fallbackToShort ? product.shortDescription : null);
  if (!html) return null;

  return (
    <div>
      {content.heading ? (
        <SectionHeading heading={content.heading} align="left" inverted={ctx.inverted} />
      ) : null}
      <RichText html={html} className={content.heading ? 'mt-5' : undefined} />
    </div>
  );
}

export function ProductFeaturesBlock({
  content,
  ctx,
}: {
  content: ProductFeaturesContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product } = productCtx;

  const cap = (list: string[]) => (content.limit > 0 ? list.slice(0, content.limit) : list);
  const features = content.showFeatures ? cap(product.features) : [];
  const benefits = content.showBenefits ? cap(product.benefits) : [];
  if (features.length === 0 && benefits.length === 0) return null;

  const columns = blockColumnVars(ctx.design, content);
  const featuresHeadingId = `product-features-${ctx.sectionId}`;
  const benefitsHeadingId = `product-benefits-${ctx.sectionId}`;

  return (
    <div className="space-y-12">
      {features.length > 0 ? (
        <section aria-labelledby={featuresHeadingId}>
          {content.featuresHeading ? (
            <h2 id={featuresHeadingId} className="font-heading text-xl font-bold text-content">
              {content.featuresHeading}
            </h2>
          ) : null}
          <ul className="cms-grid mt-5 gap-3" style={columns}>
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
                {content.showIcons ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                ) : null}
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {benefits.length > 0 ? (
        <section aria-labelledby={benefitsHeadingId}>
          {content.benefitsHeading ? (
            <h2 id={benefitsHeadingId} className="font-heading text-xl font-bold text-content">
              {content.benefitsHeading}
            </h2>
          ) : null}
          <ul className="cms-grid mt-5 gap-3" style={columns}>
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
                {content.showIcons ? (
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                ) : null}
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** The rows a specification list shows: the stored specs, plus what is modelled. */
function specRows(
  content: ProductSpecsContent,
  product: NonNullable<BlockContext['product']>['product'],
): Array<{ label: string; value: string }> {
  const rows = [...product.specs];

  if (content.showStorage && product.storage) {
    rows.unshift({ label: 'Storage', value: product.storage });
  }
  if (content.showUsers && (product.minUsers || product.maxUsers)) {
    const users =
      product.minUsers && product.maxUsers
        ? `${product.minUsers}–${product.maxUsers}`
        : product.minUsers
          ? `${product.minUsers}+`
          : `Up to ${product.maxUsers}`;
    rows.unshift({ label: 'Users', value: users });
  }
  if (content.showSku && product.sku) rows.push({ label: 'SKU', value: product.sku });

  return rows;
}

export function ProductSpecsBlock({
  content,
  ctx,
}: {
  content: ProductSpecsContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;

  const rows = specRows(content, productCtx.product);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="product-specs-heading">
      {content.heading ? (
        <h2 id="product-specs-heading" className="font-heading text-xl font-bold text-content">
          {content.heading}
        </h2>
      ) : null}
      <dl
        className={cn(
          'mt-5 text-sm',
          content.layout === 'table'
            ? 'divide-y divide-hairline border-y border-hairline'
            : 'space-y-2',
        )}
      >
        {rows.map((row, index) => (
          <div
            key={index}
            className={cn(
              'gap-4',
              content.layout === 'table'
                ? 'flex items-start justify-between py-2.5'
                : 'flex items-baseline',
            )}
          >
            <dt className="text-muted">{row.label}</dt>
            <dd
              className={cn(
                'font-medium text-content',
                content.layout === 'table' ? 'text-right' : 'ml-2',
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export async function ProductRelatedBlock({
  content,
  ctx,
}: {
  content: ProductRelatedContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product, country } = productCtx;

  /*
   * One extra is fetched and the product itself filtered out, so "three other
   * plans" is three even when the product is one of its own category's.
   */
  const related = await selectProducts(country, {
    source: content.source,
    categoryId: content.source === 'category' ? product.categoryId : undefined,
    brandId: content.source === 'brand' ? product.brandId : undefined,
    limit: content.limit + 1,
  }).then((rows) => rows.filter((row) => row.id !== product.id).slice(0, content.limit));

  if (related.length === 0) return null;

  const headingId = `product-related-${ctx.sectionId}`;

  return (
    <section aria-labelledby={headingId}>
      {content.heading ? (
        <h2 id={headingId} className="font-heading text-2xl font-bold text-content">
          {content.heading}
        </h2>
      ) : null}
      <div className="cms-grid mt-8 gap-6" style={blockColumnVars(ctx.design, content)}>
        {related.map((item) => (
          <ProductCard
            key={item.id}
            product={item}
            showPrice={content.showPrice}
            showFeatures={content.showFeatures}
            showBenefits={false}
            showSpecs={false}
            ctaLocation="product-related"
          />
        ))}
      </div>
    </section>
  );
}

export async function ProductPriceBoxBlock({
  content,
  ctx,
}: {
  content: ProductPriceBoxContent;
  ctx: BlockContext;
}) {
  const productCtx = ctx.product;
  if (!productCtx) return null;
  const { product, settings, siteName } = productCtx;

  const specs = content.showSpecs ? product.specs : [];

  /*
   * The form the box asks for, or the product's own enquiry form when it names
   * none — the same one the button opens, so a box left on the default keeps
   * following the product. A form that has been switched off or belongs to
   * another market simply does not render; the price and the button are still
   * the point of this box.
   */
  const formSlug = content.showForm ? content.formSlug || product.ctaFormSlug : '';
  const form = formSlug ? await getPublicForm(formSlug, ctx.country.id) : null;

  const formBody = form ? (
    <FormPanel
      form={form}
      formStyle={content.formStyle}
      instanceKey={ctx.sectionId}
      heading={content.formHeading}
      headingAs="p"
      headingClassName="mb-3 font-heading text-sm font-semibold text-content"
      bodyClassName=""
      productId={product.id}
      /* A sidebar is narrow, so the grid collapses unless the form's own
         design asks for more. */
      compact
      ctaLocation="product-price-box"
      /* Shown so the enquiry is unambiguous. What the server records is
         resolved from productId, never from here. */
      context={{
        product_id: product.id,
        product_name: product.name,
        product_slug: product.slug,
        plan: product.name,
      }}
    />
  ) : null;

  return (
    <div className="cms-surface rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
      {content.formPosition === 'above' && formBody ? (
        <div className="mb-6 border-b border-hairline pb-6">{formBody}</div>
      ) : null}
      {content.showMonthly && product.monthlyPrice ? (
        <>
          <p className="flex items-baseline gap-1.5">
            <span
              className="font-heading text-4xl font-bold tracking-tight text-content"
              style={{ fontSize: 'var(--product-price-size)', color: 'var(--product-price-color)' }}
            >
              {formatMoney(product.monthlyPrice, product.currency)}
            </span>
            <span className="text-sm text-muted">/month</span>
          </p>
          {product.priceSuffix ? (
            <p className="mt-1 text-xs text-muted">{product.priceSuffix}</p>
          ) : null}
          {content.showAnnual && product.annualPrice ? (
            <p className="mt-2 text-sm text-muted">
              or{' '}
              <strong className="text-content">
                {formatMoney(product.annualPrice, product.currency)}
              </strong>{' '}
              billed annually
            </p>
          ) : null}
          {content.showCompareAt && product.compareAtPrice ? (
            <p className="mt-2 text-xs text-muted">
              <span className="line-through">
                {formatMoney(product.compareAtPrice, product.currency)}
              </span>
              {product.discountPercent ? (
                <span className="ml-2 font-medium text-emerald-600">
                  Save {product.discountPercent}%
                </span>
              ) : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className="font-heading text-2xl font-bold text-content">
          {product.priceNote || 'Custom pricing'}
        </p>
      )}

      {content.showCta ? (
        <div className="cms-actions mt-6">
          <ProductCta
            product={product}
            label={content.ctaLabel || undefined}
            size="lg"
            className="w-full"
            ctaLocation="product-page"
          />
        </div>
      ) : null}

      {specs.length > 0 ? (
        <>
          {content.specsHeading ? (
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
              {content.specsHeading}
            </p>
          ) : null}
          <dl
            className={cn(
              'divide-y divide-hairline border-t border-hairline text-sm',
              content.specsHeading ? 'mt-2' : 'mt-6',
            )}
          >
            {specs.map((spec, index) => (
              <div key={index} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted">{spec.label}</dt>
                <dd className="text-right font-medium text-content">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {content.note ? (
        <p className="mt-6 text-xs leading-relaxed text-muted">
          {content.note.replace('{site}', siteName)}
        </p>
      ) : null}

      {content.formPosition === 'below' && formBody ? (
        <div className="mt-6 border-t border-hairline pt-6">{formBody}</div>
      ) : null}

      {/* The sticky behaviour itself is applied by the column wrapper; this only
          records what the section asked for. */}
      <span hidden data-sticky={content.sticky && settings.layout.sidebarSticky ? 'on' : 'off'} />
    </div>
  );
}
