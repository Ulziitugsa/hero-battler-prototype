import { DECK_SIZE, validateDeck } from '../engine/deckRules.js';
import { getLaunchDeck, launchDeckList } from './launchDecks.js';

// The three starter decks: each faction's free Core starter of the launch set (launchDecks.ts). Each is a functional
// 15-card deck built only from that faction's Core package, respecting the copy-limit rules. They also
// double as the AI's decks (README "AI Decks") - the player picks an opponent faction, the AI plays
// that faction's starter deck untouched. No separate AI-only card pool.

const starter = (id: string): string[] => launchDeckList(getLaunchDeck(id));

/** Launch set: each faction's free Core starter (second balance pass lists, launchDecks.ts). */
export const KINGDOM_STARTER: string[] = starter('kingdom-starter');
export const UNDEAD_STARTER: string[] = starter('undead-starter');
export const INFERNAL_STARTER: string[] = starter('infernal-starter');

export type StarterFaction = 'kingdom' | 'undead' | 'infernal';

export const STARTER_DECKS: Record<StarterFaction, string[]> = {
  kingdom: KINGDOM_STARTER,
  undead: UNDEAD_STARTER,
  infernal: INFERNAL_STARTER,
};

export const STARTER_DECK_NAMES: Record<StarterFaction, string> = {
  kingdom: 'Kingdom Starter',
  undead: 'Undead Starter',
  infernal: 'Infernal Starter',
};

for (const [faction, deck] of Object.entries(STARTER_DECKS)) {
  const result = validateDeck(deck);
  if (!result.valid) throw new Error(`${faction} starter deck is invalid: ${result.errors.join(', ')}`);
}

/** AI opponents reuse the same 15-card starter decks (README "AI Decks") - no separate AI card pool. */
export const AI_DECKS = STARTER_DECKS;

export { DECK_SIZE };
