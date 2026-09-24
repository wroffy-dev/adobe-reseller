import Link from 'next/link';
import Image from 'next/image';
import { Check, Sparkles } from 'lucide-react';
import type { PublicProduct } from '@/lib/services/products';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { ProductCta } from './product-cta';

/**
 * Product card.
 *
 * Every show/hide prop defaults to what the card did before they existed, so a
 * caller that passes none — and a CMS section saved before these toggles were
 * added — renders exactly as it always has.
 *
 * `showActions` is the master switch over the two action controls: when it is
 * off neither the primary CTA nor the details link renders, whatever their own
 * toggles say.
 *
 * The detail section under the price lists everything the product carries —
 * features, benefits and specifications — in full. Lists are never truncated
 * unless a section asks for it through `featureLimit`, so four features, seven
 * or ten all reach the visitor.
 */
export function ProductCard({
  product,
  billing = 'monthly',
  showPrice = true,
  showFeatures = true,
  showBenefits = true,
  showSpecs = true,
  featureLimit = 0,
  showImage = true,
  showDescription = true,
  showName = true,
  linkName = true,
  showCta = true,
  showDetailsLink = true,
  showActions = true,
  ctaLabel,
  highlight,
  ctaLocation = 'product-card',
  className,
}: {
  product: PublicProduct;
  billing?: 'monthly' | 'annual';
  showPrice?: boolean;
  showFeatures?: boolean;
  /** The product's benefit list, under the features. */
  showBenefits?: boolean;
  /** The product's specifications, as label/value rows. */
  showSpecs?: boolean;
  /**
   * Caps how many features, benefits and specifications a card lists.
   * `0` — the default — lists every one an administrator entered, so a product
   * with ten features shows ten.
   */
  featureLimit?: number;
  showImage?: boolean;
  showDescription?: boolean;
  /** Off hides the product name entirely. */
  showName?: boolean;
  /** Off renders the name as plain text instead of a link. */
  linkName?: boolean;
  showCta?: boolean;
  /** The "View full details" link. */
  showDetailsLink?: boolean;
  /** Master switch: off hides the CTA and the details link together. */
  showActions?: boolean;
  ctaLabel?: string;
  highlight?: boolean;
  ctaLocation?: string;
  /** Lets a container stretch the card — a slider slide, for one. */
  className?: string;
}) {
  const price = billing === 'annual' ? product.annualPrice : product.monthlyPrice;
  const period = billing === 'annual' ? '/year' : '/month';

  const withCta = showActions && showCta;
  const withDetails = showActions && showDetailsLink;

  /*
   * Nothing is truncated by default: a product with four features shows four
   * and one with ten shows ten, because the card is the only place a visitor
   * sees what an administrator entered. `featureLimit` exists for a section
   * that deliberately wants short cards; 0 — the default — means "all".
   */
  const cap = <T,>(list: T[]): T[] => (featureLimit > 0 ? list.slice(0, featureLimit) : list);

  const features = showFeatures ? cap(product.features) : [];
  const benefits = showBenefits ? cap(product.benefits) : [];
  const specs = showSpecs ? cap(product.specs) : [];
  const groups = [features.length, benefits.length, specs.length].filter(Boolean).length;
  const hasDetails = groups > 0;
  /*
   * With features alone the card reads as it always has — an unlabelled tick
   * list. Once a second group joins it, the headings are what tells a benefit
   * apart from a feature.
   */
  const labelled = groups > 1;

  return (
    /*
     * Every design value is a CSS variable with the card's original value as
     * its fallback, and the variables are set by Products → Design on an
     * ancestor. A site that has never opened that screen therefore renders
     * exactly the card this component always rendered.
     */
    <article
      className={cn(
        'cms-surface flex flex-col rounded-2xl border bg-surface p-6 transition-shadow',
        highlight
          ? 'border-brand shadow-lg ring-1 ring-brand/20'
          : 'border-hairline shadow-sm hover:shadow-md',
        className,
      )}
      style={{
        background: 'var(--product-card-bg, rgb(var(--brand-background)))',
        borderWidth: 'var(--product-card-border-width, 1px)',
        borderColor: highlight
          ? undefined
          : 'var(--product-card-border-color, rgb(var(--brand-border)))',
        borderRadius: 'var(--product-card-radius, 1rem)',
        padding: 'var(--product-card-padding, 1.5rem)',
        boxShadow: highlight ? undefined : 'var(--product-card-shadow)',
        textAlign: 'var(--product-card-align, left)' as React.CSSProperties['textAlign'],
      }}
    >
      {highlight ? (
        <span className="mb-4 self-start rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
          Most popular
        </span>
      ) : null}

      {showImage && product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.imageAlt ?? product.name}
          width={56}
          height={56}
          loading="lazy"
          className="mb-4 rounded-lg"
          style={{
            width: 'var(--product-card-image-width, 3.5rem)',
            height: 'var(--product-card-image-height, 3.5rem)',
            aspectRatio: 'var(--product-card-image-ratio)',
            objectFit: 'var(--product-card-image-fit, cover)' as React.CSSProperties['objectFit'],
            borderRadius: 'var(--product-card-image-radius, 0.5rem)',
          }}
        />
      ) : null}

      {showName ? (
        <h3
          className="font-heading text-lg font-bold text-content"
          style={{
            fontSize: 'var(--product-card-title-size)',
            fontWeight: 'var(--product-card-title-weight)' as React.CSSProperties['fontWeight'],
            color: 'var(--product-card-title-color)',
          }}
        >
          {linkName ? (
            <Link href={product.href} className="hover:text-brand">
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </h3>
      ) : null}

      {showDescription && product.shortDescription ? (
        <p
          className="mt-2 text-sm leading-relaxed text-muted"
          style={{ color: 'var(--product-card-description-color)' }}
        >
          {product.shortDescription}
        </p>
      ) : null}

      {showPrice ? (
        <div className="mt-5">
          {price ? (
            <>
              <p className="flex items-baseline gap-1.5">
                <span
                  className="font-heading text-3xl font-bold tracking-tight text-content"
                  style={{
                    fontSize: 'var(--product-card-price-size)',
                    color: 'var(--product-card-price-color)',
                  }}
                >
                  {formatMoney(price, product.currency)}
                </span>
                <span className="text-sm text-muted">{period}</span>
              </p>
              {product.priceSuffix ? (
                <p className="mt-1 text-xs text-muted">{product.priceSuffix}</p>
              ) : null}
              {product.compareAtPrice ? (
                <p className="mt-1 text-xs text-muted">
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
        </div>
      ) : null}

      {hasDetails ? (
        <div className="mt-6 space-y-5 border-t border-hairline pt-5">
          {features.length > 0 ? (
            <div>
              {labelled ? <GroupLabel>Features</GroupLabel> : null}
              <ul className="space-y-2.5">
                {features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 text-sm text-muted"
                    style={{ color: 'var(--product-card-feature-color)' }}
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                      style={{ color: 'var(--product-card-icon-color)' }}
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {benefits.length > 0 ? (
            <div>
              {labelled ? <GroupLabel>Benefits</GroupLabel> : null}
              <ul className="space-y-2.5">
                {benefits.map((benefit, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 text-sm text-muted"
                    style={{ color: 'var(--product-card-feature-color)' }}
                  >
                    <Sparkles
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                      style={{ color: 'var(--product-card-icon-color)' }}
                      aria-hidden="true"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {specs.length > 0 ? (
            <div>
              {labelled ? <GroupLabel>Specifications</GroupLabel> : null}
              <dl className="divide-y divide-hairline border-y border-hairline text-sm">
                {specs.map((spec, index) => (
                  <div key={index} className="flex items-start justify-between gap-4 py-2">
                    <dt className="text-muted">{spec.label}</dt>
                    <dd className="text-right font-medium text-content">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Dropped entirely when neither action shows, so the card does not end
          with an empty block of padding. */}
      {withCta || withDetails ? (
        <div className="mt-auto pt-6">
          {withCta ? (
            <ProductCta
              product={product}
              label={ctaLabel}
              className="w-full"
              ctaLocation={ctaLocation}
            />
          ) : null}
          {withDetails ? (
            <Link
              href={product.href}
              className={cn(
                'block text-center text-xs font-medium text-muted underline-offset-4 hover:text-brand hover:underline',
                withCta && 'mt-3',
              )}
            >
              View full details
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** The small heading over a group of product details inside the card. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted/80">{children}</p>
  );
}
