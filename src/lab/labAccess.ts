// Card Discovery Lab access (docs/design/CARD-DISCOVERY-LAB.md). The lab is an experiment, not a feature: it exists only
// in a build that turns it on (__CARD_LAB__, vite.config.ts: the dev server, VITE_CARD_LAB=1, or a Vercel preview), and
// only on a page load that asks for it with ?lab. A production build has __CARD_LAB__ = false, so the lab, its chunk
// and its entry in main.tsx are dropped from the bundle.

/** The query parameter that opens the lab instead of the game: /?lab */
export const LAB_PARAM = 'lab';

/** True when this page load asked for the lab. Pure: the build gate (__CARD_LAB__) is applied by the caller. */
export function isLabUrl(search: string): boolean {
  return new URLSearchParams(search).has(LAB_PARAM);
}
