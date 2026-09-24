import Link from 'next/link';
import Image from 'next/image';
import { Check, Minus } from 'lucide-react';
import type {
  ProductCardsContent,
  ProductTableContent,
  ProductGridContent,
} from '@/lib/cms/blocks';
import { selectProducts } from '@/lib/services/products';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { ProductCard } from '@/components/products/product-card';
import { getProductSettings } from '@/lib/services/product-cms';
import { productCardVars, productImageVars } from '@/lib/cms/product-settings';
import { ProductCta } from '@/components/products/product-cta';
import { SectionHeading, blockColumnVars, type BlockContext } from './shared';


/**
 * The card design variables, as a style object.
 *
 * Product cards appear on any page, not only on product pages, so each block
 * that renders them carries the catalogue's card and image settings down. The
 * variables all have the card's original value as their fallback, so a site
 * that has never opened Products → Design renders exactly what it did before.
 */
async function cardStyle(): Promise<React.CSSProperties> {
  const settings = await getProductSettings();
  return {
    ...productCardVars(settings.card),
    ...productImageVars(settings.image),
    gap: 'var(--product-grid-gap)',
    rowGap: 'var(--product-grid-row-gap)',
  } as React.CSSProperties;
}

export async function ProductCardsBlock({
  content,
  ctx,
}: {
  content: ProductCardsContent;
  ctx: BlockContext;
}) {
  const inverted = ctx.inverted;
  const products = await selectProducts(ctx.country, {
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    limit: content.limit,
  });

  if (products.length === 0) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No published products are available yet."
        inverted={inverted}
      />
    );
  }

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />
      <div
        className="cms-grid items-stretch"
        style={{ ...blockColumnVars(ctx.design, content), ...(await cardStyle()) }}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            billing={content.billing}
            showImage={content.showImage}
            showDescription={content.showDescription}
            showPrice={content.showPrice}
            showFeatures={content.showFeatures}
            showBenefits={content.showBenefits}
            showSpecs={content.showSpecs}
            featureLimit={content.featureLimit}
            showName={content.showName}
            linkName={content.linkName}
            showCta={content.showCta}
            showDetailsLink={content.showDetailsLink}
            showActions={content.showActions}
            highlight={products.length > 1 && product.isFeatured && products.indexOf(product) === 1}
            ctaLocation="product-cards"
          />
        ))}
      </div>
    </>
  );
}

/**
 * Comparison table.
 *
 * Desktop renders a real <table> with products as columns. Below `lg` it
 * switches to stacked per-product cards — a horizontally scrolling table with
 * five columns is unusable on a phone.
 */
export async function ProductTableBlock({
  content,
  ctx,
}: {
  content: ProductTableContent;
  ctx: BlockContext;
}) {
  const inverted = ctx.inverted;
  const products = await selectProducts(ctx.country, {
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    limit: content.limit,
  });

  if (products.length === 0) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No published products are available yet."
        inverted={inverted}
      />
    );
  }

  const rows: Array<{ label: string; render: (p: (typeof products)[number]) => React.ReactNode }> =
    [];

  if (content.showStorage) {
    rows.push({
      label: 'Storage',
      render: (p) => p.storage ?? <Minus className="h-4 w-4 text-muted" />,
    });
  }
  if (content.showUsers) {
    rows.push({
      label: 'Users',
      render: (p) => {
        if (p.minUsers && p.maxUsers) return `${p.minUsers}–${p.maxUsers}`;
        if (p.minUsers) return `${p.minUsers}+`;
        if (p.maxUsers) return `Up to ${p.maxUsers}`;
        return <Minus className="h-4 w-4 text-muted" aria-label="Not applicable" />;
      },
    });
  }
  if (content.showMonthly) {
    rows.push({
      label: 'Monthly',
      render: (p) =>
        p.monthlyPrice ? (
          <span className="font-semibold text-content">
            {formatMoney(p.monthlyPrice, p.currency)}
          </span>
        ) : (
          <span className="text-muted">{p.priceNote || 'On request'}</span>
        ),
    });
  }
  if (content.showAnnual) {
    rows.push({
      label: 'Annual',
      render: (p) =>
        p.annualPrice ? (
          <span className="font-semibold text-content">
            {formatMoney(p.annualPrice, p.currency)}
          </span>
        ) : (
          <span className="text-muted">{p.priceNote || 'On request'}</span>
        ),
    });
  }

  /*
   * Features and benefits are listed in full: `featureLimit` — 0 unless an
   * editor sets it — is the only thing that shortens them, so a plan with ten
   * features compares on all ten.
   */
  const cap = <T,>(list: T[]): T[] =>
    content.featureLimit > 0 ? list.slice(0, content.featureLimit) : list;

  const listRows: Array<{
    label: string;
    items: (p: (typeof products)[number]) => string[];
  }> = [];
  if (content.showFeatures) listRows.push({ label: 'Features', items: (p) => cap(p.features) });
  if (content.showBenefits) listRows.push({ label: 'Benefits', items: (p) => cap(p.benefits) });
  // A row no product fills is an empty band across the table, so it is dropped.
  const filledListRows = listRows.filter((row) => products.some((p) => row.items(p).length > 0));
  const withSpecs = content.showSpecs && products.some((p) => p.specs.length > 0);

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />

      {/* Desktop: comparison table */}
      <div className="cms-surface hidden overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{content.heading || 'Product comparison'}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-52 border-b border-hairline bg-muted/[0.04] px-5 py-4 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Plan
                </span>
              </th>
              {products.map((product) => (
                <th
                  key={product.id}
                  scope="col"
                  className="border-b border-l border-hairline bg-muted/[0.04] px-5 py-4 text-left align-top"
                >
                  <span className="block font-heading text-base font-bold text-content">
                    {product.name}
                  </span>
                  {product.shortDescription ? (
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-muted">
                      {product.shortDescription}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-hairline px-5 py-3.5 text-left font-medium text-muted"
                >
                  {row.label}
                </th>
                {products.map((product) => (
                  <td
                    key={product.id}
                    className="border-b border-l border-hairline px-5 py-3.5 text-content"
                  >
                    {row.render(product)}
                  </td>
                ))}
              </tr>
            ))}

            {filledListRows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-hairline px-5 py-4 text-left align-top font-medium text-muted"
                >
                  {row.label}
                </th>
                {products.map((product) => (
                  <td
                    key={product.id}
                    className="border-b border-l border-hairline px-5 py-4 align-top"
                  >
                    <ul className="space-y-2">
                      {row.items(product).map((item, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-muted">
                          <Check
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}

            {withSpecs ? (
              <tr>
                <th
                  scope="row"
                  className="border-b border-hairline px-5 py-4 text-left align-top font-medium text-muted"
                >
                  Specifications
                </th>
                {products.map((product) => (
                  <td
                    key={product.id}
                    className="border-b border-l border-hairline px-5 py-4 align-top"
                  >
                    <dl className="space-y-1.5 text-xs">
                      {cap(product.specs).map((spec, index) => (
                        <div key={index} className="flex items-start justify-between gap-3">
                          <dt className="text-muted">{spec.label}</dt>
                          <dd className="text-right font-medium text-content">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </td>
                ))}
              </tr>
            ) : null}

            <tr>
              <th scope="row" className="px-5 py-4 text-left">
                <span className="sr-only">Actions</span>
              </th>
              {products.map((product) => (
                <td key={product.id} className="border-l border-hairline px-5 py-4">
                  <ProductCta
                    product={product}
                    label={content.ctaLabel}
                    size="sm"
                    className="w-full"
                    ctaLocation="product-table"
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile & tablet: stacked cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:hidden">
        {products.map((product) => (
          <article
            key={product.id}
            className="cms-surface rounded-xl border border-hairline bg-surface p-5 shadow-sm"
          >
            <h3 className="font-heading text-base font-bold text-content">{product.name}</h3>
            {product.shortDescription ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {product.shortDescription}
              </p>
            ) : null}

            <dl className="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-right text-content">{row.render(product)}</dd>
                </div>
              ))}
            </dl>

            {filledListRows.map((row) =>
              row.items(product).length > 0 ? (
                <div key={row.label} className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted/80">
                    {row.label}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {row.items(product).map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-muted">
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}

            {content.showSpecs && product.specs.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted/80">
                  Specifications
                </p>
                <dl className="mt-2 divide-y divide-hairline border-y border-hairline text-xs">
                  {cap(product.specs).map((spec, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 py-2">
                      <dt className="text-muted">{spec.label}</dt>
                      <dd className="text-right font-medium text-content">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <ProductCta
              product={product}
              label={content.ctaLabel}
              className="mt-5 w-full"
              ctaLocation="product-table"
            />
          </article>
        ))}
      </div>
    </>
  );
}

/**
 * Product grid.
 *
 * The reusable way to put products on any CMS page. Source, ordering, column
 * count and every show/hide toggle come from the section's own configuration,
 * so the same block covers a pricing page, a category page and a homepage rail.
 */
export async function ProductGridBlock({
  content,
  ctx,
}: {
  content: ProductGridContent;
  ctx: BlockContext;
}) {
  const products = await selectProducts(ctx.country, {
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    brandId: content.brandId,
    limit: content.limit,
  });

  const heading = (
    <SectionHeading
      eyebrow={content.eyebrow}
      heading={content.heading}
      description={content.description}
      inverted={ctx.inverted}
      className={content.heading || content.description ? 'mb-10' : undefined}
    />
  );

  if (products.length === 0) {
    return (
      <>
        {heading}
        <p
          className={cn(
            'rounded-[var(--layout-card-radius)] border border-dashed px-4 py-8 text-center text-sm',
            ctx.inverted ? 'border-white/25 text-white/70' : 'border-hairline text-muted',
          )}
        >
          No published products match this section yet.
        </p>
      </>
    );
  }

  /*
   * Lists are shown whole — 0 means "every one" — so a product with ten
   * features does not silently lose six of them to the row it sits in.
   */
  const cap = <T,>(list: T[]): T[] =>
    content.featureLimit > 0 ? list.slice(0, content.featureLimit) : list;

  /** The list layout runs features and benefits together as one line of chips. */
  const listItems = (product: (typeof products)[number]): string[] => [
    ...(content.showFeatures ? cap(product.features) : []),
    ...(content.showBenefits ? cap(product.benefits) : []),
  ];

  if (content.layout === 'list') {
    return (
      <>
        {heading}
        <ul className="space-y-4">
          {products.map((product) => (
            <li
              key={product.id}
              className={cn(
                'flex flex-col gap-5 rounded-[var(--layout-card-radius)] p-5 sm:flex-row sm:items-center',
                ctx.inverted ? 'bg-white/10' : 'border border-hairline bg-surface shadow-sm',
              )}
            >
              {content.showImage && product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.imageAlt ?? product.name}
                  width={72}
                  height={72}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : null}

              <div className="min-w-0 flex-1">
                {content.showName ? (
                  <h3
                    className={cn(
                      'font-heading text-base font-bold',
                      ctx.inverted ? 'text-white' : 'text-content',
                    )}
                  >
                    {content.linkName ? (
                      <Link href={product.href} className="hover:underline">
                        {product.name}
                      </Link>
                    ) : (
                      product.name
                    )}
                  </h3>
                ) : null}
                {content.showDescription && product.shortDescription ? (
                  <p
                    className={cn(
                      'mt-1 text-sm leading-relaxed',
                      ctx.inverted ? 'text-white/75' : 'text-muted',
                    )}
                  >
                    {product.shortDescription}
                  </p>
                ) : null}
                {listItems(product).length > 0 ? (
                  <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                    {listItems(product).map((item, index) => (
                      <li
                        key={index}
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          ctx.inverted ? 'text-white/70' : 'text-muted',
                        )}
                      >
                        <Check className="h-3 w-3 shrink-0 cms-accent" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {content.showSpecs && product.specs.length > 0 ? (
                  <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {cap(product.specs).map((spec, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <dt className={ctx.inverted ? 'text-white/60' : 'text-muted'}>
                          {spec.label}:
                        </dt>
                        <dd
                          className={cn(
                            'font-medium',
                            ctx.inverted ? 'text-white' : 'text-content',
                          )}
                        >
                          {spec.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>

              {content.showPrice ? (
                <PriceTag product={product} billing={content.billing} inverted={ctx.inverted} />
              ) : null}

              {content.showActions && content.showCta ? (
                <ProductCta
                  product={product}
                  label={content.ctaLabel || undefined}
                  size="sm"
                  className="shrink-0"
                  ctaLocation="product-grid"
                />
              ) : null}

              {content.showActions && content.showDetailsLink ? (
                <Link
                  href={product.href}
                  className={cn(
                    'shrink-0 text-xs font-medium underline-offset-4 hover:underline',
                    ctx.inverted ? 'text-white/75 hover:text-white' : 'text-muted hover:text-brand',
                  )}
                >
                  View full details
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      {heading}
      <div
        className="cms-grid items-stretch"
        style={{ ...blockColumnVars(ctx.design, content, 3), ...(await cardStyle()) }}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            billing={content.billing}
            showPrice={content.showPrice}
            showFeatures={content.showFeatures}
            showBenefits={content.showBenefits}
            showSpecs={content.showSpecs}
            featureLimit={content.featureLimit}
            showImage={content.showImage}
            showDescription={content.showDescription}
            showName={content.showName}
            linkName={content.linkName}
            showCta={content.showCta}
            showDetailsLink={content.showDetailsLink}
            showActions={content.showActions}
            ctaLabel={content.ctaLabel || undefined}
            ctaLocation="product-grid"
          />
        ))}
      </div>
    </>
  );
}

function PriceTag({
  product,
  billing,
  inverted,
}: {
  product: Awaited<ReturnType<typeof selectProducts>>[number];
  billing: 'monthly' | 'annual';
  inverted: boolean;
}) {
  const price = billing === 'annual' ? product.annualPrice : product.monthlyPrice;
  if (!price) {
    return (
      <span className={cn('shrink-0 text-sm', inverted ? 'text-white/70' : 'text-muted')}>
        {product.priceNote || 'On request'}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'shrink-0 font-heading text-lg font-bold',
        inverted ? 'text-white' : 'text-content',
      )}
    >
      {formatMoney(price, product.currency)}
      <span className={cn('ml-1 text-xs font-normal', inverted ? 'text-white/65' : 'text-muted')}>
        {billing === 'annual' ? '/year' : '/month'}
      </span>
    </span>
  );
}
