import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getPublishedPage } from "@/lib/services/pages";
import { getWebsiteSettings } from "@/lib/services/settings";
import {
  getNavigations,
  getPrimaryNavigation,
} from "@/lib/services/navigation";
import { MaintenanceNotice } from "@/components/public/maintenance-notice";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { PopupHost } from "@/components/public/popup-host";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/seo/structured-data";
import { getCurrentUser } from "@/lib/auth/guards";
import { resolveCountryPath } from "@/lib/country/registry";
import { getCountrySettings } from "@/lib/country/settings";
import { resolveMarketOptions } from "@/lib/country/switch";
import { countryPath, contentSlug, countryHref } from "@/lib/country/routing";
import type { CountryContext } from "@/lib/country/types";
import type { ButtonVariant } from "@/components/ui/button";
import { loadLinks } from "@/lib/urls/links";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "/";

  /*
   * The market owns the request from here down: navigation, contact details,
   * popups and structured data are all resolved for it. Resolution is one
   * request-cached lookup shared with the page below, so a market-aware layout
   * costs no extra query.
   */
  const { country, path } = await resolveCountryPath(pathname);
  // Fresh URL-registry addresses for every link rendered below (menus, cards,
  // breadcrumbs). One cached query, shared by the whole request.
  await loadLinks();

  // A CMS page can opt out of the site header or footer. Other public routes
  // (blog, products) always show both. getPublishedPage is request-cached, so
  // this adds no extra query for the page route itself.
  const chrome = await resolveChrome(country, path);

  const [site, local, nav, markets, popups] = await Promise.all([
    getWebsiteSettings(),
    getCountrySettings(country),
    getPrimaryNavigation(country),
    resolveMarketOptions(country, path),
    prisma.popup.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        // A popup with no market is shown everywhere; one bound to a market is
        // shown only in that storefront.
        OR: [{ countryId: null }, { countryId: country.id }],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
      include: {
        image: { select: { url: true, altText: true } },
        form: { select: { slug: true } },
        leadMagnet: { select: { slug: true, title: true } },
        pageTargets: { select: { page: { select: { slug: true, countryId: true } } } },
      },
    }),
  ]);

  // Maintenance mode hides the public site from visitors — a restore turns it
  // on for the duration so nobody browses a half-restored database. Signed-in
  // staff are exempt, so the person running the restore can still check it.
  if (site.maintenanceMode) {
    const staff = await getCurrentUser();
    if (!staff) {
      return <MaintenanceNotice siteName={site.siteName} logoUrl={site.logoUrl} />;
    }
  }

  /*
   * A popup pinned to specific pages is pinned to pages in one market. Dropping
   * it here rather than in the client matters: an empty target list means
   * "everywhere", so a popup whose only targets are India's pages would
   * otherwise start firing on every UAE page instead of none.
   */
  const visiblePopups = popups.filter(
    (popup) =>
      popup.pageTargets.length === 0 ||
      popup.pageTargets.some((target) => target.page.countryId === country.id),
  );

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {chrome.showHeader ? (
        <SiteHeader
          nav={nav}
          markets={markets}
          brand={{
            siteName: site.siteName,
            logoUrl: site.logoUrl,
            homeUrl: countryPath(country),
            ctaLabel: local.headerCtaLabel,
            ctaUrl: countryHref(country, local.headerCtaUrl),
            secondaryCtaLabel: site.headerSecondaryCtaLabel,
            secondaryCtaUrl: countryHref(country, site.headerSecondaryCtaUrl),
            menuAlign: (site.headerMenuAlign as 'left' | 'center' | 'right') ?? 'left',
            sticky: site.headerSticky,
            border: site.headerBorder,
            glassEdge: site.headerGlassEdge,
            showLogo: site.headerShowLogo,
            showSiteName: site.headerShowSiteName,
            showMenu: site.headerShowMenu,
            showMarkets: site.headerShowMarkets,
            ctaIcon: site.headerCtaIcon,
            ctaIconSide: site.headerCtaIconSide === 'right' ? 'right' : 'left',
            ctaVariant: (site.headerCtaVariant || 'primary') as ButtonVariant,
            secondaryCtaIcon: site.headerSecondaryCtaIcon,
            secondaryCtaIconSide: site.headerSecondaryCtaIconSide === 'right' ? 'right' : 'left',
            secondaryCtaVariant: (site.headerSecondaryCtaVariant || 'ghost') as ButtonVariant,
            announcement:
              site.announcementEnabled && site.announcementText
                ? {
                    text: site.announcementText,
                    url: countryHref(country, site.announcementUrl),
                  }
                : null,
          }}
        />
      ) : null}
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      {chrome.showFooter ? <SiteFooter settings={site} local={local} country={country} /> : null}
      <PopupHost
        basePath={countryPath(country)}
        popups={visiblePopups.map((p) => ({
          id: p.id,
          type: p.type,
          heading: p.heading,
          body: p.body,
          imageUrl: p.image?.url ?? null,
          imageAlt: p.image?.altText ?? null,
          formSlug: p.form?.slug ?? null,
          leadMagnetSlug: p.leadMagnet?.slug ?? null,
          ctaLabel: p.ctaLabel,
          ctaUrl: countryHref(country, p.ctaUrl),
          trigger: p.trigger,
          delaySeconds: p.delaySeconds,
          scrollPercent: p.scrollPercent,
          device: p.device,
          frequencyDays: p.frequencyDays,
          urlPatterns: Array.isArray(p.urlPatterns)
            ? (p.urlPatterns as string[])
            : [],
          // Page targets only count when the page belongs to this market, so a
          // popup pinned to India's pricing page never fires on the UAE one.
          pageSlugs: p.pageTargets
            .filter((t) => t.page.countryId === country.id)
            .map((t) => t.page.slug),
        }))}
      />
      <JsonLd data={[organizationSchema(country, local, site), websiteSchema(country, site)]} />
    </>
  );
}

/** CMS pages may hide the header or footer; every other route keeps both. */
async function resolveChrome(
  country: CountryContext,
  path: string,
): Promise<{ showHeader: boolean; showFooter: boolean }> {
  const slug = contentSlug(path);
  if (slug === "blog" || slug.startsWith("blog/") || slug.startsWith("products/")) {
    return { showHeader: true, showFooter: true };
  }
  try {
    const page = await getPublishedPage(country.id, slug);
    if (!page) return { showHeader: true, showFooter: true };
    return { showHeader: page.showHeader, showFooter: page.showFooter };
  } catch {
    return { showHeader: true, showFooter: true };
  }
}
