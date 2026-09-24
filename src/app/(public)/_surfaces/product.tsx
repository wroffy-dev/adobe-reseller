import type { Metadata } from 'next';
import { getPublicProduct, getProductSeo, findLiveProductCountries } from '@/lib/services/products';
import { getMediaByIds } from '@/lib/services/media';
import { redirectOrNotFound } from '@/lib/services/redirects';
import { taxonomyHrefs } from '@/lib/services/taxonomy-pages';
import { getWebsiteSettings } from '@/lib/services/settings';
import { buildMetadata, absoluteCountryUrl } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { countryBreadcrumbSchema, productSchema } from '@/lib/seo/structured-data';
import { SectionList, type RenderableSection } from '@/components/cms/section-renderer';
import { getProductSections, getProductSettings } from '@/lib/services/product-cms';
import { productStyleVars, type ProductLayoutSettings } from '@/lib/cms/product-settings';
import { segmentDetail } from '@/lib/cms/product-segments';
import type { ProductRenderContext } from '@/lib/cms/product-render';
import { cn } from '@/lib/utils/cn';
import type { CountryContext } from '@/lib/country/types';

/**
 * A product page, in one market.
 *
 * Identity, specification and imagery come from the global product; price,
 * currency, availability, local copy and SEO come from that market's
 * `ProductCountry` row — which is also what decides whether the page exists
 * there at all.
 */

export async function productMetadata(
  country: CountryContext,
  slug: string,
): Promise<Metadata> {
  const [row, alternates] = await Promise.all([
    getProductSeo(country.id, slug),
    findLiveProductCountries(slug),
  ]);
  if (!row) return { title: 'Product not found', robots: { index: false, follow: false } };

  const product = row.product;

  return buildMetadata({
    title: row.seoTitle || product.seoTitle || product.name,
    description: row.seoDescription || product.seoDescription || product.shortDescription,
    path: `/products/${slug}`,
    country,
    alternateCountryIds: alternates,
    canonicalUrl: row.canonicalUrl || product.canonicalUrl,
    noIndex: row.noIndex || product.noIndex,
    ogImageUrl: row.ogImage?.url ?? product.ogImage?.url ?? product.image?.url ?? null,
    type: 'product',
  });
}

export async function ProductSurface({
  country,
  slug,
}: {
  country: CountryContext;
  slug: string;
}) {
  const [product, site, settings] = await Promise.all([
    getPublicProduct(country, slug),
    getWebsiteSettings(),
    getProductSettings(),
  ]);
  /*
   * A product this market does not sell — renamed, retired, or never offered
   * here — follows a redirect if one was written for its address. A renamed
   * product's old URL is exactly what the redirect manager is for.
   */
  if (!product) return redirectOrNotFound(country, `products/${slug}`);

  const [gallery, detail, sidebar, taxonomy] = await Promise.all([
    getMediaByIds(product.galleryIds),
    getProductSections(product.id, 'DETAIL'),
    getProductSections(product.id, 'SIDEBAR'),
    taxonomyHrefs(country, product),
  ]);

  // Preserve the order the admin arranged in the gallery picker.
  const galleryImages = product.galleryIds
    .map((id) => gallery.get(id))
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  /*
   * One context for the whole page. Every section reads the product from here
   * rather than querying for it, which is what lets a product page be built
   * from the same blocks as any other page.
   */
  const ctx: ProductRenderContext = {
    country,
    product,
    gallery: galleryImages,
    settings,
    siteName: site.siteName,
    categoryHref: taxonomy.categoryHref,
    brandHref: taxonomy.brandHref,
  };

  const { layout } = settings;
  const withSidebar = layout.sidebarEnabled && sidebar.some((section) => section.isVisible);
  const segments = segmentDetail(detail, withSidebar);

  return (
    <div
      className="product-surface"
      style={productStyleVars(settings) as React.CSSProperties}
    >
      {segments.map((segment, index) =>
        segment.stretch ? (
          /*
           * A stretched run renders the way a page's sections do: full-bleed,
           * with its content in the standard container, so it lines up with
           * the header at every width and zoom.
           */
          <SectionList
            key={segment.key}
            sections={segment.sections}
            product={ctx}
            country={country}
            allowFirst={index === 0}
          />
        ) : (
          <BoxedColumn
            key={segment.key}
            sections={segment.sections}
            sidebar={segment.withSidebar ? sidebar : null}
            ctx={ctx}
            layout={layout}
            allowFirst={index === 0}
          />
        ),
      )}

      <JsonLd
        data={[
          productSchema({
            name: product.name,
            description: product.shortDescription,
            url: absoluteCountryUrl(country, `products/${product.slug}`),
            imageUrl: product.imageUrl,
            price: product.monthlyPrice,
            currency: product.currency,
            sku: product.sku,
            brand: site.siteName,
          }),
          countryBreadcrumbSchema(country, [
            { name: 'Home', path: '' },
            { name: 'Plans', path: 'pricing' },
            { name: product.name, path: `products/${product.slug}` },
          ]),
        ]}
      />
    </div>
  );
}

/**
 * The boxed column: the product's container, its two-column grid and, when
 * this run carries it, the sidebar.
 */
function BoxedColumn({
  sections,
  sidebar,
  ctx,
  layout,
  allowFirst,
}: {
  sections: RenderableSection[];
  sidebar: RenderableSection[] | null;
  ctx: ProductRenderContext;
  layout: ProductLayoutSettings;
  allowFirst: boolean;
}) {
  return (
    <div
      className="mx-auto px-4 py-14 sm:px-6 sm:py-20"
      // Blank inherits the website's own container, as the design screen says.
      style={{ maxWidth: 'var(--product-container, var(--layout-container, 72rem))' }}
    >
      <div
        className={cn(
          'product-layout',
          !sidebar && 'product-layout--no-sidebar',
          sidebar && layout.sidebarPosition === 'left' && 'product-layout--left',
          sidebar && layout.mobileSidebar === 'above' && 'product-layout--aside-above',
          sidebar && layout.mobileSidebar === 'hidden' && 'product-layout--aside-hidden',
        )}
      >
        {/* A flex column rather than `space-y`, so the gap between sections
            is one CSS variable the design screen can set. */}
        <div
          className="product-layout__main flex flex-col"
          style={{ gap: 'var(--product-section-gap, 3rem)' }}
        >
          <SectionList
            sections={sections}
            product={ctx}
            country={ctx.country}
            container={false}
            allowFirst={allowFirst}
          />
        </div>

        {/* The sidebar follows the content in the markup as well as in the
            grid, so a phone reads the product first whichever column the
            sidebar takes on a wide screen. */}
        {sidebar ? (
          <ProductAside sections={sidebar} ctx={ctx} sticky={layout.sidebarSticky} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The product's sidebar column.
 *
 * Sticky and mobile placement are design settings rather than per-section
 * ones: a price box that sticks on one product and not another is an
 * inconsistency a visitor notices, and neither is worth a control on every
 * widget. Both live in `.product-layout` in globals.css, where the phone
 * placement is a row of the grid rather than a stack of order utilities.
 */
function ProductAside({
  sections,
  ctx,
  sticky,
}: {
  sections: RenderableSection[];
  ctx: ProductRenderContext;
  sticky: boolean;
}) {
  return (
    <aside
      className={cn(
        'product-layout__aside space-y-6',
        sticky && 'product-layout__aside--sticky',
      )}
    >
      <SectionList
        sections={sections}
        product={ctx}
        country={ctx.country}
        container={false}
        allowFirst={false}
      />
    </aside>
  );
}
