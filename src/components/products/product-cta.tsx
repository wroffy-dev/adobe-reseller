'use client';

import * as React from 'react';
import Link from 'next/link';
import type { PublicProduct } from '@/lib/services/products';
import { Button, buttonClasses, type ButtonVariant } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PublicFormLoader } from '@/components/forms/form-loader';
import { safeUrl } from '@/lib/utils/sanitize';
import { trackConversion } from '@/lib/analytics/attribution';
import { cn } from '@/lib/utils/cn';

/**
 * Product call-to-action.
 *
 * There is no checkout in this release: the CTA either opens the product's lead
 * form in a dialog or follows an explicit URL. Either way the resulting lead
 * carries the product, page, CTA label and attribution.
 */
export function ProductCta({
  product,
  variant = 'primary',
  size = 'md',
  className,
  label,
  ctaLocation = 'product',
}: {
  product: Pick<PublicProduct, 'id' | 'name' | 'slug' | 'href' | 'ctaLabel' | 'ctaUrl' | 'ctaFormSlug'>;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  ctaLocation?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ctaLabel = label || product.ctaLabel || 'Get Started';
  const href = safeUrl(product.ctaUrl);

  if (!product.ctaFormSlug && href) {
    return (
      <Link
        href={href}
        className={buttonClasses(variant, size, cn('btn-tokens', className))}
        onClick={() => trackConversion('select_item', { item_name: product.name, cta: ctaLabel })}
      >
        {ctaLabel}
      </Link>
    );
  }

  if (!product.ctaFormSlug) {
    // No form and no URL configured — send the visitor to the product page.
    return (
      <Link href={product.href} className={buttonClasses(variant, size, cn('btn-tokens', className))}>
        {ctaLabel}
      </Link>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        // A public button: it takes Website Design's button settings.
        className={cn('btn-tokens', className)}
        onClick={() => {
          trackConversion('select_item', { item_name: product.name, cta: ctaLabel });
          setOpen(true);
        }}
      >
        {ctaLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${ctaLabel} — ${product.name}`}
        description="Tell us a little about your team and we will come back with pricing."
        size="lg"
      >
        <PublicFormLoader
          slug={product.ctaFormSlug}
          productId={product.id}
          ctaLabel={ctaLabel}
          ctaLocation={ctaLocation}
          /*
           * Shown to the visitor so the enquiry is unambiguous. The value the
           * server stores is resolved from productId, so this is presentation
           * only — a tampered value changes what the visitor sees, never what
           * is recorded.
           */
          context={{
            product_id: product.id,
            product_name: product.name,
            product_slug: product.slug,
            plan: product.name,
          }}
        />
      </Dialog>
    </>
  );
}
