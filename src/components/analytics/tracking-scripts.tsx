import Script from 'next/script';
import type { ScriptPlacement, TrackingScript, TrackingSettings } from '@prisma/client';
import { ID_PATTERNS, sanitizeId } from '@/lib/analytics/google-tags';

/**
 * Renders the tracking configured in Admin → Marketing.
 *
 * Vendor tags are emitted from fixed templates with only a validated ID
 * interpolated — an admin cannot inject arbitrary JavaScript through them.
 * Free-form scripts are a separate, explicitly privileged feature.
 *
 * Google Tag Manager, GA4 and Google Ads are not here: the root layout writes
 * them into the server HTML's <head> — see src/lib/analytics/google-tags.ts.
 */

export function HeadTracking({
  settings,
  scripts,
  consentGranted,
}: {
  settings: TrackingSettings;
  scripts: TrackingScript[];
  consentGranted: boolean;
}) {
  const gate = settings.consentRequired && !consentGranted;
  if (gate) return <CustomScripts scripts={scripts} placement="HEAD" consentGranted={consentGranted} />;

  const meta = settings.metaPixelEnabled ? sanitizeId(settings.metaPixelId, ID_PATTERNS.numeric) : null;
  const uet = settings.microsoftUetEnabled ? sanitizeId(settings.microsoftUetId, ID_PATTERNS.numeric) : null;
  const hotjar = settings.hotjarEnabled ? sanitizeId(settings.hotjarId, ID_PATTERNS.numeric) : null;
  const linkedin = settings.linkedinEnabled ? sanitizeId(settings.linkedinPartnerId, ID_PATTERNS.numeric) : null;
  const tiktok = settings.tiktokEnabled ? sanitizeId(settings.tiktokPixelId, ID_PATTERNS.alnum) : null;

  return (
    <>
      {meta ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {uet ? (
        <Script id="ms-uet" strategy="afterInteractive">
          {`(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${uet}"};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");`}
        </Script>
      ) : null}

      {hotjar ? (
        <Script id="hotjar" strategy="afterInteractive">
          {`(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${hotjar},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
        </Script>
      ) : null}

      {linkedin ? (
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`_linkedin_partner_id="${linkedin}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      ) : null}

      {tiktok ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(e,n){e[n]=function(){e.push([n].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=n;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      ) : null}

      <CustomScripts scripts={scripts} placement="HEAD" consentGranted={consentGranted} />
    </>
  );
}

export function BodyTracking({
  scripts,
  placement,
  consentGranted,
}: {
  settings: TrackingSettings;
  scripts: TrackingScript[];
  placement: Extract<ScriptPlacement, 'BODY_START' | 'BODY_END'>;
  consentGranted: boolean;
}) {
  // GTM's <noscript> fallback is rendered by the root layout, right after
  // <body> opens, alongside the <head> tags.
  return <CustomScripts scripts={scripts} placement={placement} consentGranted={consentGranted} />;
}

function CustomScripts({
  scripts,
  placement,
  consentGranted,
}: {
  scripts: TrackingScript[];
  placement: ScriptPlacement;
  consentGranted: boolean;
}) {
  const env = process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT';
  const active = scripts.filter(
    (s) =>
      s.isActive &&
      s.placement === placement &&
      (s.environment === 'ALL' || s.environment === env) &&
      (!s.requiresConsent || consentGranted),
  );
  if (active.length === 0) return null;

  return (
    <>
      {active.map((script) => (
        <Script key={script.id} id={`custom-${script.id}`} strategy="afterInteractive">
          {script.code}
        </Script>
      ))}
    </>
  );
}
