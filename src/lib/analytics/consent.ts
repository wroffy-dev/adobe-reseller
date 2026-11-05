/**
 * The visitor's answer to the cookie banner, shared by the banner (client) and
 * the layouts (server) so both read and write the same cookie.
 *
 * The name and values are what the banner has always written; changing them
 * would silently reset every visitor's choice.
 */
export const CONSENT_COOKIE = 'tracking_consent';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

/** Google Consent Mode v2 signals, as passed to gtag('consent', …). */
export type ConsentSignals = {
  ad_storage: 'granted' | 'denied';
  ad_user_data: 'granted' | 'denied';
  ad_personalization: 'granted' | 'denied';
  analytics_storage: 'granted' | 'denied';
  functionality_storage: 'granted' | 'denied';
  security_storage: 'granted' | 'denied';
};

export const ALL_GRANTED: ConsentSignals = {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
  functionality_storage: 'granted',
  security_storage: 'granted',
};

/** Advertising and analytics storage off; strictly necessary storage on. */
export const TRACKING_DENIED: ConsentSignals = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
};

/**
 * Whether tracking may run for this visitor: always when the "Ask for consent"
 * switch is off, otherwise only once they have accepted the banner.
 */
export function isConsentGranted(consentRequired: boolean, cookieValue: string | undefined): boolean {
  return !consentRequired || cookieValue === CONSENT_GRANTED;
}
