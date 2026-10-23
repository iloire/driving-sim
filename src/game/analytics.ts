/**
 * Google Analytics 4, only when the build has a measurement ID (VITE_GA_ID; CI sets it, dev builds don't).
 * Consent Mode starts every storage denied, so nothing is stored until the player taps "OK" on the
 * one-line chip in the corner; before that GA gets cookieless pings only. The choice is kept per browser.
 */

declare global {
  interface Window { dataLayer: unknown[] }
}

const ID: string = import.meta.env.VITE_GA_ID ?? '';
const CONSENT_KEY = 'lanzarote-drive.stats';

// gtag.js reads the Arguments object itself, not an array; the rest parameter is only there for the types.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function grant(on: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, on ? 'yes' : 'no');
  } catch { /* private window: asked again next visit */ }
  gtag('consent', 'update', { analytics_storage: on ? 'granted' : 'denied' });
}

/** The chip: one line, bottom-right above the credits, gone after either answer. */
function askOnce(): void {
  const chip = document.createElement('div');
  chip.id = 'stats-chip';
  chip.innerHTML = 'Anonymous play stats? <button type="button" data-on>OK</button><button type="button">No</button>';
  chip.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    grant(b.hasAttribute('data-on'));
    chip.remove();
  });
  document.body.append(chip);
}

export function initAnalytics(): void {
  if (!ID) return;
  window.dataLayer = window.dataLayer || [];
  const consent = readConsent();
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: consent === 'yes' ? 'granted' : 'denied',
  });
  gtag('js', new Date());
  gtag('config', ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.append(s);
  if (!consent) askOnce();
}

/** A gameplay event; a no-op without a measurement ID. */
export function track(name: string, params: Record<string, string | number | boolean> = {}): void {
  if (ID) gtag('event', name, params);
}
