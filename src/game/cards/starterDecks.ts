import { DECK_SIZE, validateDeck } from '../engine/deckRules';

// The three Card Set v0.1 starter decks (README "Starter Decks"). Each is a reasonably functional
// 15-card deck built from that faction's roster slice, respecting the copy-limit rules. They also
// double as the AI's decks (README "AI Decks") - the player picks an opponent faction, the AI plays
// that faction's starter deck untouched. No separate AI-only card pool.

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

export const KINGDOM_STARTER: string[] = expand([
  ['kng-common-knight', 2],
  ['kng-archer', 2],
  ['kng-royal-guard', 2],
  ['kng-light-priest', 2],
  ['kng-battle-captain', 2],
  ['kng-paladin', 1], // Legendary - max 1
  ['spl-power-surge', 2],
  ['spl-battle-banner', 2],
]);

export const UNDEAD_STARTER: string[] = expand([
  ['und-bone-soldier', 2],
  ['und-cursed-warrior', 2],
  ['und-dark-priest', 2],
  ['und-grave-knight', 2],
  ['und-mira', 2],
  ['und-vharos', 1], // Legendary - max 1
  ['spl-second-chance', 2],
  ['spl-raise-fallen', 2],
]);

export const INFERNAL_STARTER: string[] = expand([
  ['inf-flame-imp', 2],
  ['inf-cultist', 2],
  ['inf-pit-fiend', 2],
  ['inf-hellhound', 2],
  ['inf-blood-demon', 2],
  ['inf-infernal-lord', 1], // Legendary - max 1
  ['spl-weakness', 2],
  ['spl-fireball', 2],
]);

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
