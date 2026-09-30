import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { getPublishedPage, findPublishedPageCountries } from '@/lib/services/pages';
import { redirectOrNotFound } from '@/lib/services/redirects';
import { getWebsiteSettings } from '@/lib/services/settings';
import { SectionList } from '@/components/cms/section-renderer';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata } from '@/lib/seo/metadata';
import { cityServiceSchema, countryBreadcrumbSchema, faqSchema } from '@/lib/seo/structured-data';
import { getCountrySettings } from '@/lib/country/settings';
import { cityOfPage, pagePublicPaths } from '@/lib/services/cities';
import { absoluteCountryUrl, absoluteUrl } from '@/lib/seo/metadata';
import { parseBlockContent, type FaqContent } from '@/lib/cms/blocks';
import type { CountryContext } from '@/lib/country/types';
import { listActiveCountries } from '@/lib/country/registry';
import { loadLinks } from '@/lib/urls/links';
import { notFound } from 'next/navigation';

/**
 * A CMS page, in one market.
 *
 * Both entry points — the root market's catch-all and a prefixed market's —
 * render through here, so there is exactly one implementation of "what is a CMS
 * page" and no chance of the two drifting apart.
 */

export async function cmsPageMetadata(
  country: CountryContext,
  slug: string,
  /** The registered public path, when the URL registry resolved this request. */
  fullPath?: string,
): Promise<Metadata> {
  const page = await getPublishedPage(country.id, slug);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };

  const [ogImage, twitterImage, alternates, links, markets] = await Promise.all([
    page.ogImageId
      ? prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } })
      : null,
    page.twitterImageId
      ? prisma.media.findUnique({ where: { id: page.twitterImageId }, select: { url: true } })
      : null,
    findPublishedPageCountries(slug),
    loadLinks(),
    listActiveCountries(),
  ]);

  // Pages pair across markets by slug; each market's address comes from the
  // registry, so a market that gave its page its own URL still pairs up.
  const alternatePaths = links.enabled
    ? Object.fromEntries(
        markets
          .filter((market) => alternates.includes(market.id))
          .map((market) => [market.id, links.page(market, slug)]),
      )
    : undefined;

  return buildMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    path: `/${slug}`,
    fullPath: fullPath ?? (links.enabled ? links.page(country, slug) : undefined),
    country,
    alternateCountryIds: alternates,
    alternatePaths,
    canonicalUrl: page.canonicalUrl,
    keywords: page.primaryKeywords,
    noIndex: page.noIndex,
    noFollow: page.noFollow,
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
    ogImageUrl: ogImage?.url ?? null,
    twitterTitle: page.twitterTitle,
    twitterDescription: page.twitterDescription,
    twitterImageUrl: twitterImage?.url ?? null,
  });
}

export async function CmsPageSurface({
  country,
  slug,
  path,
}: {
  country: CountryContext;
  slug: string;
  /** The registered public path, when the URL registry resolved this request. */
  path?: string;
}) {
  const page = await getPublishedPage(country.id, slug);
  if (!page && path) notFound();

  /*
   * A missing page in one market never falls back to another market's content
   * — that would serve the wrong prices to the wrong customers. A redirect
   * written for this address is followed; otherwise it is a 404.
   */
  if (!page) return redirectOrNotFound(country, slug);

  const site = await getWebsiteSettings();

  // FAQ structured data is derived from any FAQ sections on the page.
  const faqItems = page.sections
    .filter((s) => s.blockType === 'faq' && s.isVisible)
    .flatMap((s) => parseBlockContent<FaqContent>('faq', s.content).items);
  const faq = faqSchema(faqItems);

  // A city page sits under Home; a city's product page under its city.
  const city = slug === '' ? null : await cityOfPage(page.id);
  const parent =
    city?.kind === 'cityProduct' && city.parent && city.parent.status === 'PUBLISHED'
      ? { name: city.city.name, path: (await pagePublicPaths([{ ...city.parent, countryId: page.countryId }])).get(city.parent.id) }
      : null;

  const crumbs =
    slug === ''
      ? null
      : countryBreadcrumbSchema(country, [
          { name: site.siteName, path: '' },
          ...(parent?.path ? [{ name: parent.name, path: parent.path }] : []),
          { name: city?.kind === 'city' ? city.city.name : page.title, path: path ?? slug },
        ]);

  let service = null;
  if (city) {
    const local = await getCountrySettings(country);
    service = cityServiceSchema({
      name: page.seoTitle?.split('|')[0]?.trim() || page.title,
      description: page.seoDescription,
      url: absoluteUrl(path ?? `/${slug}`),
      provider: {
        type: local.localBusinessType || local.organizationType || 'Organization',
        name: local.organizationName,
        url: absoluteCountryUrl(country, '/'),
      },
      city: { name: city.city.name, region: city.city.region },
      country,
    });
  }

  return (
    <>
      <SectionList sections={page.sections} country={country} />
      {faq ? <JsonLd data={faq} /> : null}
      {crumbs ? <JsonLd data={crumbs} /> : null}
      {service ? <JsonLd data={service} /> : null}
    </>
  );
}
