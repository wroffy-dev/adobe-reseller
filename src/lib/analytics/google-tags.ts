import type { TrackingSettings } from '@prisma/client';

/**
 * Google Tag Manager and the Google tag (GA4 / Google Ads), as plain snippets.
 *
 * Why these are not `next/script` components: `afterInteractive` scripts are
 * left out of the server HTML and injected by client JavaScript only once
 * React has hydrated. Every Google checker reads the page source — Tag
 * Assistant, GTM's "Test your website", GA4's "tag not detected" warning and
 * Search Console's GA/GTM verification — so they all reported the tags as
 * missing, a visitor who left before hydration was never counted, and a page
 * that did not hydrate (the 404 page, for one) never sent anything at all.
 *
 * The snippets are now written into `<head>` by the server, where Google's
 * install instructions put them. The same strings are also run by the public
 * layout's client-side fallback (a visitor who arrives from the admin by
 * client-side navigation, or who has just accepted the consent banner, has a
 * page whose server HTML carried no tags). Each snippet marks itself loaded on
 * `window`, so whichever copy runs first wins and the other does nothing: no
 * double gtm.js, no double page_view.
 *
 * Only IDs that match their documented shape are interpolated, and they are
 * written as JSON string literals, so nothing an admin types can become code.
 */

export const ID_PATTERNS = {
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  gtm: /^GTM-[A-Z0-9]{4,20}$/i,
  ads: /^AW-[0-9]{6,20}$/i,
  numeric: /^[0-9]{6,25}$/,
  alnum: /^[A-Za-z0-9_-]{4,40}$/,
} as const;

/** The trimmed ID when it matches its pattern, otherwise null. */
export function sanitizeId(
  id: string | null | undefined,
  pattern: RegExp,
  { upper = false }: { upper?: boolean } = {},
): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!pattern.test(trimmed)) return null;
  // Google IDs are upper-case; a lower-case "g-abc123" passes the pattern but
  // gtag('config') would register a destination GA4 does not know.
  return upper ? trimmed.toUpperCase() : trimmed;
}

export type GoogleTags = {
  gtmId: string | null;
  ga4Id: string | null;
  adsId: string | null;
  /** Inline GTM bootstrap, or null when GTM is off. */
  gtmSnippet: string | null;
  /** Inline Google tag bootstrap (loads gtag.js itself), or null when off. */
  gtagSnippet: string | null;
};

/** Which Google tags are switched on with a valid ID, and their snippets. */
export function resolveGoogleTags(settings: TrackingSettings): GoogleTags {
  const gtmId = settings.gtmEnabled ? sanitizeId(settings.gtmId, ID_PATTERNS.gtm, { upper: true }) : null;
  const ga4Id = settings.ga4Enabled ? sanitizeId(settings.ga4Id, ID_PATTERNS.ga4, { upper: true }) : null;
  const adsId = settings.googleAdsEnabled
    ? sanitizeId(settings.googleAdsId, ID_PATTERNS.ads, { upper: true })
    : null;

  return {
    gtmId,
    ga4Id,
    adsId,
    gtmSnippet: gtmId ? gtmBootstrap(gtmId) : null,
    gtagSnippet: ga4Id || adsId ? gtagBootstrap([ga4Id, adsId].filter((id): id is string => Boolean(id))) : null,
  };
}

/** The ID the GA4 opt-out flag (`ga-disable-<id>`) is keyed on, if any. */
export function ga4MeasurementId(settings: TrackingSettings): string | null {
  return sanitizeId(settings.ga4Id, ID_PATTERNS.ga4, { upper: true });
}

/** Google's documented GTM snippet, made safe to run twice. */
function gtmBootstrap(id: string): string {
  return (
    `(function(w,d,s,l,i){w.__googleTags=w.__googleTags||{};if(w.__googleTags[i])return;w.__googleTags[i]=1;` +
    `w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
    `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';` +
    `j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;` +
    `if(f&&f.parentNode){f.parentNode.insertBefore(j,f);}else{d.head.appendChild(j);}` +
    `})(window,document,'script','dataLayer',${JSON.stringify(id)});`
  );
}

/** Google's documented gtag.js snippet, made safe to run twice. */
function gtagBootstrap(ids: string[]): string {
  const key = `gtag:${ids.join(',')}`;
  const src = `https://www.googletagmanager.com/gtag/js?id=${ids[0]}`;
  return (
    `(function(w,d,ids,k,src){w.__googleTags=w.__googleTags||{};if(w.__googleTags[k])return;w.__googleTags[k]=1;` +
    `w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};` +
    `w.gtag('js',new Date());for(var n=0;n<ids.length;n++){w.gtag('config',ids[n]);}` +
    `var j=d.createElement('script');j.async=true;j.src=src;d.head.appendChild(j);` +
    `})(window,document,${JSON.stringify(ids)},${JSON.stringify(key)},${JSON.stringify(src)});`
  );
}
