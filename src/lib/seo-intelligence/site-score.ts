import type { Finding } from './types';
import { finding } from './finding';

/**
 * Website-level checks for one market — 100 points. These are the settings
 * every page inherits, so a problem here costs every page.
 *
 *   Indexable market       20
 *   Sitemap                15
 *   robots.txt             15
 *   Published homepage     15
 *   Default title/descr.   10
 *   Organisation details   15
 *   Search console         5
 *   Default share image    5
 */

export type SiteInput = {
  market: { name: string; isPublished: boolean };
  noIndexSite: boolean;
  noIndexCountry: boolean;
  sitemapEnabled: boolean;
  excludeFromSitemap: boolean;
  sitemapUrlCount: number;
  robotsErrors: string[];
  robotsWarnings: string[];
  homepagePublished: boolean;
  defaultTitle: string;
  defaultDescription: string;
  org: { name: string; hasPhone: boolean; hasEmail: boolean; hasAddress: boolean; hasLogo: boolean };
  verification: boolean;
  defaultOgImage: boolean;
};

export function siteFindings(input: SiteInput): Finding[] {
  const indexable = !input.noIndexSite && !input.noIndexCountry && input.market.isPublished;
  const sitemap = input.sitemapEnabled && !input.excludeFromSitemap && input.sitemapUrlCount > 0;
  const orgPoints = (input.org.name ? 4 : 0) + (input.org.hasPhone || input.org.hasEmail ? 4 : 0) + (input.org.hasAddress ? 4 : 0) + (input.org.hasLogo ? 3 : 0);

  return [
    finding({
      id: 'site.indexable',
      category: 'site',
      severity: 'critical',
      points: indexable ? 20 : 0,
      maxPoints: 20,
      title: 'Market can be indexed',
      description: input.noIndexSite
        ? 'The whole site is set to noindex.'
        : input.noIndexCountry
          ? `${input.market.name} is set to noindex.`
          : !input.market.isPublished
            ? `${input.market.name} is not published for search engines yet.`
            : `${input.market.name} is open to search engines.`,
      recommendation: 'When the market is ready, publish it and switch off noindex in its settings.',
    }),
    finding({
      id: 'site.sitemap',
      category: 'site',
      severity: 'warning',
      points: sitemap ? 15 : 0,
      maxPoints: 15,
      title: 'XML sitemap',
      description: !input.sitemapEnabled
        ? 'The sitemap is switched off.'
        : input.excludeFromSitemap
          ? `${input.market.name} is excluded from the sitemap.`
          : `${input.sitemapUrlCount} URL${input.sitemapUrlCount === 1 ? '' : 's'} listed for ${input.market.name}.`,
      recommendation: 'Enable the sitemap and publish indexable pages so search engines can discover them.',
    }),
    finding({
      id: 'site.robots',
      category: 'site',
      severity: input.robotsErrors.length ? 'critical' : 'warning',
      points: input.robotsErrors.length ? 0 : input.robotsWarnings.length ? 8 : 15,
      maxPoints: 15,
      title: 'robots.txt',
      description: input.robotsErrors.length || input.robotsWarnings.length
        ? [...input.robotsErrors, ...input.robotsWarnings].slice(0, 3).join(' ')
        : 'robots.txt has no conflicting rules.',
      recommendation: 'Review the robots.txt preview under SEO and remove the rules it warns about.',
    }),
    finding({
      id: 'site.homepage',
      category: 'site',
      severity: 'critical',
      points: input.homepagePublished ? 15 : 0,
      maxPoints: 15,
      title: 'Published homepage',
      description: input.homepagePublished ? 'The market has a published homepage.' : 'No published homepage in this market.',
      recommendation: 'Publish a page and mark it as the homepage.',
    }),
    finding({
      id: 'site.defaults',
      category: 'site',
      severity: 'warning',
      points: (input.defaultTitle.trim() ? 5 : 0) + (input.defaultDescription.trim() ? 5 : 0),
      maxPoints: 10,
      title: 'Default title and description',
      description: 'Used by every page that sets none of its own.',
      recommendation: 'Set a default title and description under SEO or the country’s settings.',
    }),
    finding({
      id: 'site.org',
      category: 'site',
      severity: 'warning',
      points: orgPoints,
      maxPoints: 15,
      title: 'Organisation details',
      description: `Name${input.org.hasPhone || input.org.hasEmail ? ', contact' : ''}${input.org.hasAddress ? ', address' : ''}${input.org.hasLogo ? ', logo' : ''} set — these feed the Organization schema on every page.`,
      recommendation: 'Complete the organisation name, phone or email, address and logo for this market.',
    }),
    finding({
      id: 'site.verification',
      category: 'site',
      severity: 'info',
      points: input.verification ? 5 : 0,
      maxPoints: 5,
      title: 'Search console verification',
      description: input.verification ? 'A search console verification code is set.' : 'No Google or Bing verification code is set.',
      recommendation: 'Add a verification code under SEO to monitor indexing.',
    }),
    finding({
      id: 'site.ogImage',
      category: 'site',
      severity: 'info',
      points: input.defaultOgImage ? 5 : 0,
      maxPoints: 5,
      title: 'Default share image',
      description: input.defaultOgImage ? 'Pages without their own image share a default one.' : 'No default share image.',
      recommendation: 'Set a default Open Graph image.',
    }),
  ];
}
