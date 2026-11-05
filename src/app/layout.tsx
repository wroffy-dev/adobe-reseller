import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { getSeoSettings, getTrackingSettings, getWebsiteSettings } from '@/lib/services/settings';
import { BrandStyle } from '@/components/public/brand-style';
import { TrackingRouteGuard } from '@/components/analytics/tracking-route-guard';
import { GoogleTagsHead, GoogleTagManagerNoscript } from '@/components/analytics/google-tags';
import { GoogleTagsLoader } from '@/components/analytics/google-tags-loader';
import { ga4MeasurementId, resolveGoogleTags } from '@/lib/analytics/google-tags';
import { isPrivatePath } from '@/lib/analytics/private-paths';
import { CONSENT_COOKIE, isConsentGranted } from '@/lib/analytics/consent';
import { ToastProvider } from '@/components/ui/toast';
import { getRequestCountry } from '@/lib/country/request';
import { siteUrl } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const [site, seo] = await Promise.all([getWebsiteSettings(), getSeoSettings()]);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: seo.defaultTitle, template: seo.titleTemplate },
    description: seo.defaultDescription,
    icons: site.faviconUrl ? { icon: site.faviconUrl } : undefined,
    applicationName: site.siteName,
  };
}

/*
 * Every page is rendered per request. The root layout reads the database (the
 * site's settings) and the request (its market), and the image is built with
 * no database to reach — see the Dockerfile. Reading the consent cookie here
 * used to make that true by accident; with the tags moved to the public layout
 * it is said outright, or the build tries to pre-render /_not-found and fails.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, tracking, country, headerList, cookieStore] = await Promise.all([
    getWebsiteSettings(),
    getTrackingSettings(),
    // The market's own BCP-47 tag, so `<html lang>` agrees with the canonical
    // and the hreflang annotations the page emits. Request-cached, so this
    // shares the resolution the public layout already made.
    getRequestCountry().catch(() => null),
    headers(),
    cookies(),
  ]);

  /*
   * Google tags go in the server HTML's <head>, where Google's install
   * instructions and every Google checker expect them — see
   * src/lib/analytics/google-tags.ts. In order: the Consent Mode v2 default,
   * then GTM, then gtag.js (GA4 / Google Ads).
   *
   * GTM is written for every visitor, whatever their consent: Consent Mode
   * keeps its tags from storing anything until the banner is accepted, and the
   * container has to be in the page source for Search Console to verify the
   * site through it. gtag.js loads outside GTM, so it still waits for consent,
   * as do the other vendors' tags in the public layout.
   *
   * Never during maintenance. The <head> copy is written on public paths only
   * (the path comes from middleware); GoogleTagsLoader runs the same snippets
   * in the browser wherever the <head> copy could not run — the client-rendered
   * 404 page, arrival from the admin by client-side navigation, the re-render
   * after consent — and itself skips private paths.
   */
  const pathname = headerList.get('x-pathname');
  const consentGranted = isConsentGranted(tracking.consentRequired, cookieStore.get(CONSENT_COOKIE)?.value);
  const googleTags = site.maintenanceMode ? null : resolveGoogleTags(tracking, consentGranted);
  const tagsInHead = googleTags !== null && pathname !== null && !isPrivatePath(pathname);

  const measurementId = ga4MeasurementId(tracking);
  const measurementIds = measurementId ? [measurementId] : [];

  return (
    <html lang={country?.locale || 'en'} suppressHydrationWarning>
      <head>
        {tagsInHead ? <GoogleTagsHead tags={googleTags} /> : null}
        <BrandStyle settings={site} />
      </head>
      <body>
        {tagsInHead ? <GoogleTagManagerNoscript gtmId={googleTags.gtmId} /> : null}
        <TrackingRouteGuard measurementIds={measurementIds} />
        {googleTags ? (
          <GoogleTagsLoader
            consentSnippet={googleTags.consentSnippet}
            gtmSnippet={googleTags.gtmSnippet}
            gtagSnippet={googleTags.gtagSnippet}
          />
        ) : null}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
