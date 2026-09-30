import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSeoSettings, getTrackingSettings, getWebsiteSettings } from '@/lib/services/settings';
import { BrandStyle } from '@/components/public/brand-style';
import { TrackingRouteGuard } from '@/components/analytics/tracking-route-guard';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, tracking, country] = await Promise.all([
    getWebsiteSettings(),
    // Only for the route guard. The tags themselves render in the public
    // layout, so the admin, sign-in, 2FA and preview screens never load them.
    getTrackingSettings(),
    // The market's own BCP-47 tag, so `<html lang>` agrees with the canonical
    // and the hreflang annotations the page emits. Request-cached, so this
    // shares the resolution the public layout already made.
    getRequestCountry().catch(() => null),
  ]);

  const measurementIds = [tracking.ga4Id?.trim() ?? ''].filter(Boolean);

  return (
    <html lang={country?.locale || 'en'} suppressHydrationWarning>
      <head>
        <BrandStyle settings={site} />
      </head>
      <body>
        <TrackingRouteGuard measurementIds={measurementIds} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
