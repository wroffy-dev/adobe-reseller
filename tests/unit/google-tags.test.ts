import { describe, it, expect, beforeEach } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import type { TrackingSettings } from '@prisma/client';
import { ga4MeasurementId, resolveGoogleTags, sanitizeId, ID_PATTERNS } from '@/lib/analytics/google-tags';
import {
  ALL_GRANTED,
  CONSENT_COOKIE,
  CONSENT_GRANTED,
  TRACKING_DENIED,
  isConsentGranted,
} from '@/lib/analytics/consent';

/**
 * GTM and GA4 used to be injected only after hydration, so they were missing
 * from the page source and never ran on the client-rendered 404 page. They are
 * now plain snippets written into <head>, with a client fallback that may run
 * the same snippet again — which must then do nothing.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function settings(overrides: Partial<TrackingSettings> = {}): TrackingSettings {
  return {
    id: 'singleton',
    ga4Id: null,
    ga4Enabled: false,
    gtmId: null,
    gtmEnabled: false,
    googleAdsId: null,
    googleAdsEnabled: false,
    googleAdsConversionLabel: null,
    metaPixelId: null,
    metaPixelEnabled: false,
    microsoftUetId: null,
    microsoftUetEnabled: false,
    hotjarId: null,
    hotjarEnabled: false,
    linkedinPartnerId: null,
    linkedinEnabled: false,
    tiktokPixelId: null,
    tiktokEnabled: false,
    consentRequired: false,
    consentMessage: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A tiny browser: enough DOM for the snippets, recording injected scripts. */
function browser() {
  const injected: string[] = [];
  const el = () => ({ async: false, src: '' });
  const firstScript = {
    parentNode: { insertBefore: (node: { src: string }) => injected.push(node.src) },
  };
  const document = {
    createElement: el,
    getElementsByTagName: () => [firstScript],
    head: { appendChild: (node: { src: string }) => injected.push(node.src) },
  };
  const window: Record<string, unknown> = {};
  const context = vm.createContext({ window, document, Date });
  const run = (code: string) => vm.runInContext(code, context);
  const dataLayer = () =>
    ((window.dataLayer as unknown[]) ?? []).map((entry) =>
      entry && typeof entry === 'object' && 'length' in (entry as object)
        ? Array.from(entry as ArrayLike<unknown>)
        : entry,
    );
  return { run, injected, dataLayer, window };
}

describe('resolveGoogleTags', () => {
  it('returns nothing when the tags are off or the IDs are malformed', () => {
    expect(resolveGoogleTags(settings({ ga4Id: 'G-ABC1234', gtmId: 'GTM-ABC1234' }), true)).toMatchObject({
      gtmSnippet: null,
      gtagSnippet: null,
    });
    expect(
      resolveGoogleTags(settings({ ga4Id: "G-1');alert(1)//", ga4Enabled: true, gtmId: 'nope', gtmEnabled: true }), true),
    ).toMatchObject({ gtmSnippet: null, gtagSnippet: null });
  });

  it('upper-cases IDs, which Google treats as case-sensitive', () => {
    const tags = resolveGoogleTags(
      settings({ ga4Id: ' g-abc1234 ', ga4Enabled: true, gtmId: 'gtm-abc1234', gtmEnabled: true }),
      true,
    );
    expect(tags.ga4Id).toBe('G-ABC1234');
    expect(tags.gtmId).toBe('GTM-ABC1234');
    expect(ga4MeasurementId(settings({ ga4Id: 'g-abc1234' }))).toBe('G-ABC1234');
    expect(sanitizeId('C1a2B3', ID_PATTERNS.alnum)).toBe('C1a2B3');
  });

  it('loads gtm.js and gtag.js and configures GA4 and Ads', () => {
    const tags = resolveGoogleTags(
      settings({
        ga4Id: 'G-ABC1234',
        ga4Enabled: true,
        gtmId: 'GTM-ABC1234',
        gtmEnabled: true,
        googleAdsId: 'AW-1234567',
        googleAdsEnabled: true,
      }),
      true,
    );
    const b = browser();
    b.run(tags.consentSnippet!);
    b.run(tags.gtmSnippet!);
    b.run(tags.gtagSnippet!);

    expect(b.injected).toEqual([
      'https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234',
      'https://www.googletagmanager.com/gtag/js?id=G-ABC1234',
    ]);
    const layer = b.dataLayer();
    expect(layer[0]).toEqual(['consent', 'default', ALL_GRANTED]);
    expect(layer[1]).toMatchObject({ event: 'gtm.js' });
    expect(layer.slice(2).map((entry) => (entry as unknown[])[0])).toEqual(['js', 'config', 'config']);
    expect(layer.slice(3)).toEqual([
      ['config', 'G-ABC1234'],
      ['config', 'AW-1234567'],
    ]);
    expect(typeof b.window.gtag).toBe('function');
  });

  describe('running twice (the <head> copy, then the client fallback)', () => {
    let b: ReturnType<typeof browser>;
    beforeEach(() => {
      b = browser();
    });

    it('loads each library once and sends one page view', () => {
      const tags = resolveGoogleTags(
        settings({ ga4Id: 'G-ABC1234', ga4Enabled: true, gtmId: 'GTM-ABC1234', gtmEnabled: true }),
        true,
      );
      for (let i = 0; i < 2; i += 1) {
        b.run(tags.consentSnippet!);
        b.run(tags.gtmSnippet!);
        b.run(tags.gtagSnippet!);
      }
      expect(b.injected).toHaveLength(2);
      expect(b.dataLayer()).toHaveLength(4);
    });
  });
});

describe('Google Consent Mode v2', () => {
  const gtmAndGa4 = settings({
    ga4Id: 'G-ABC1234',
    ga4Enabled: true,
    gtmId: 'GTM-N8PTNGGM',
    gtmEnabled: true,
    consentRequired: true,
  });

  it('reads the visitor state from the existing cookie', () => {
    expect(CONSENT_COOKIE).toBe('tracking_consent');
    expect(isConsentGranted(false, undefined)).toBe(true);
    expect(isConsentGranted(true, undefined)).toBe(false);
    expect(isConsentGranted(true, 'denied')).toBe(false);
    expect(isConsentGranted(true, CONSENT_GRANTED)).toBe(true);
  });

  it('always writes GTM, with denied defaults until consent, and holds gtag.js back', () => {
    const tags = resolveGoogleTags(gtmAndGa4, false);
    expect(tags.gtmSnippet).toContain('GTM-N8PTNGGM');
    expect(tags.gtagSnippet).toBeNull();

    const b = browser();
    b.run(tags.consentSnippet!);
    b.run(tags.gtmSnippet!);
    expect(b.injected).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-N8PTNGGM']);
    const layer = b.dataLayer();
    expect(layer[0]).toEqual(['consent', 'default', { ...TRACKING_DENIED, wait_for_update: 500 }]);
    expect(TRACKING_DENIED).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
    });
    expect(layer[1]).toMatchObject({ event: 'gtm.js' });
  });

  it('defaults to granted once accepted, and loads gtag.js', () => {
    const tags = resolveGoogleTags(gtmAndGa4, true);
    expect(tags.consentSnippet).toContain(`'consent','default',${JSON.stringify(ALL_GRANTED)}`);
    expect(tags.gtagSnippet).toContain('G-ABC1234');
  });

  it('sets the default only once, so a later copy cannot undo the banner update', () => {
    const b = browser();
    b.run(resolveGoogleTags(gtmAndGa4, false).consentSnippet!);
    b.run(resolveGoogleTags(gtmAndGa4, true).consentSnippet!);
    expect(b.dataLayer().filter((e) => Array.isArray(e) && e[0] === 'consent')).toHaveLength(1);
  });

  it('writes no consent script when no Google tag is on', () => {
    expect(resolveGoogleTags(settings({ consentRequired: true }), false).consentSnippet).toBeNull();
  });

  it('the banner sends a consent update and keeps the cookie keys', () => {
    const banner = read('src/components/analytics/consent-banner.tsx');
    expect(banner).toContain("'consent', 'update'");
    expect(banner).toContain('updateConsent(granted ? ALL_GRANTED : TRACKING_DENIED)');
    expect(banner).toContain('CONSENT_COOKIE');
  });
});

describe('where the Google tags render', () => {
  it('in the root layout <head>, as plain scripts rather than next/script', () => {
    const rootLayout = read('src/app/layout.tsx');
    expect(rootLayout).toMatch(/<head>\s*\{tagsInHead \? <GoogleTagsHead/);
    // GTM is not gated on consent any more; Consent Mode handles that.
    expect(rootLayout).toContain('site.maintenanceMode ? null : resolveGoogleTags(tracking, consentGranted)');
    expect(rootLayout).toContain('<GoogleTagManagerNoscript');
    expect(rootLayout).toContain('<GoogleTagsLoader');
    expect(rootLayout).toContain('isPrivatePath(pathname)');

    const component = read('src/components/analytics/google-tags.tsx');
    expect(component).not.toMatch(/from 'next\/script'/);
    expect(component).toContain('dangerouslySetInnerHTML');
    expect(component.indexOf('google-consent-default')).toBeLessThan(component.indexOf('google-tag-manager'));

    const vendorTags = read('src/components/analytics/tracking-scripts.tsx');
    expect(vendorTags).not.toContain('gtm.js');
    expect(vendorTags).not.toContain('gtag/js');
  });
});
