// The static boot screen in index.html (styled inline there) covers the page from first paint until React has
// committed its first frame, so a cold start never shows a blank page. Dismissing it fades it out over the live app,
// then removes it. Safe to call more than once (StrictMode runs effects twice) and when there is no splash (tests).

export const BOOT_SPLASH_ID = 'boot-splash';
const FADE_MS = 360;

export function dismissBootSplash(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  const splash = doc?.getElementById(BOOT_SPLASH_ID);
  if (!splash || splash.classList.contains('is-leaving')) return;
  splash.classList.add('is-leaving');
  splash.setAttribute('aria-hidden', 'true');
  const remove = () => splash.remove();
  splash.addEventListener('transitionend', remove, { once: true });
  // Reduced motion has no transition to end; this also covers a transition that never fires.
  window.setTimeout(remove, FADE_MS + 120);
}
