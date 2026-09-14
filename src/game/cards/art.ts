// Card art pipeline. Real artwork lives in public/art/<cardId>.png and is served at /art/<cardId>.png.
// CARDS_WITH_ART is the explicit manifest of which card ids currently have a real image - not every
// card does yet, and every surface that renders art must keep falling back to its existing
// faction-tinted placeholder for ids not listed here (never a broken-image icon).
//
// To add more anchor art later: drop the PNG in public/art/<cardId>.png using the card's exact id as
// the filename, then add that id to this set. No other code needs to change - every surface that
// calls cardArtUrl() picks it up automatically.
const CARDS_WITH_ART = new Set<string>(['kng-paladin', 'kng-light-priest', 'und-mira', 'und-bone-soldier', 'inf-infernal-lord', 'inf-hellhound']);

/** Returns the art URL for a card id, or null if this card doesn't have real art yet (render the
 * existing placeholder instead - never an <img> with a src that 404s). */
export function cardArtUrl(cardId: string): string | null {
  return CARDS_WITH_ART.has(cardId) ? `/art/${cardId}.png` : null;
}
