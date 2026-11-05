'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ALL_GRANTED,
  CONSENT_COOKIE,
  CONSENT_DENIED,
  CONSENT_GRANTED,
  TRACKING_DENIED,
  type ConsentSignals,
} from '@/lib/analytics/consent';

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/**
 * Tells Google Consent Mode the visitor's answer.
 *
 * GTM is already on the page with advertising and analytics storage denied by
 * default (see src/lib/analytics/google-tags.ts); this update is what lets its
 * tags run. gtag is defined in <head>, but it is defined here too, the way
 * Google documents it, so the update is queued even if that script did not run.
 */
function updateConsent(signals: ConsentSignals) {
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  w.gtag =
    w.gtag ||
    function gtag() {
      // gtag.js and GTM read the Arguments object itself, not an array copy.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
  w.gtag('consent', 'update', signals);
}

/** Shown only when Admin → Marketing requires consent before loading tags. */
export function ConsentBanner({ message }: { message: string }) {
  const [visible, setVisible] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    setVisible(!document.cookie.includes(`${CONSENT_COOKIE}=`));
  }, []);

  const decide = (granted: boolean) => {
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `${CONSENT_COOKIE}=${granted ? CONSENT_GRANTED : CONSENT_DENIED};path=/;max-age=${maxAge};samesite=lax`;
    // Accept grants everything; Decline restates the denied defaults.
    updateConsent(granted ? ALL_GRANTED : TRACKING_DENIED);
    setVisible(false);
    // Re-render so the tags that wait for consent outside GTM (GA4 / Google
    // Ads via gtag.js, the other pixels, consent-gated custom scripts) load.
    if (granted) router.refresh();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-toast mx-auto max-w-3xl rounded-xl border border-hairline bg-surface p-4 shadow-2xl sm:inset-x-6 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{message}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => decide(false)}>
            Decline
          </Button>
          <Button size="sm" onClick={() => decide(true)}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
