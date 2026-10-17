// Arcane Trials access (Power Fantasy Phase 1, docs/design/POWER-FANTASY-P1.md). An experiment, not a feature: it exists
// only in a build that turns experiments on (__CARD_LAB__, vite.config.ts: the dev server, VITE_CARD_LAB=1, or a Vercel
// preview), and only on a page load that asks for it with ?trials. A production build has __CARD_LAB__ = false, so the
// trials, their cards, their chunk and their entry in main.tsx are dropped from the bundle. Nothing links to it.

/** The query parameter that opens the Arcane Trials instead of the game: /?trials */
export const TRIALS_PARAM = 'trials';

/** True when this page load asked for the Arcane Trials. Pure: the build gate (__CARD_LAB__) is applied by the caller. */
export function isTrialsUrl(search: string): boolean {
  return new URLSearchParams(search).has(TRIALS_PARAM);
}
