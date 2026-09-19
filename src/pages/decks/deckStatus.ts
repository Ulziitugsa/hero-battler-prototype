import type { CardDefinition, Rarity } from '../../game/types';
import { getCard } from '../../game/cards';
import { DECK_SIZE, maxCopiesFor, validateDeck } from '../../game/engine/deckRules';
import { getCollection } from '../../game/collection/collection';
import { deckOwnershipShortfalls, describeShortfall } from '../../game/collection/deckOwnership';
import type { OwnedMap } from '../../game/collection/types';

// Presentation-only reading of a deck: how far along it is and what (if anything) is over a limit.
// The rules themselves stay in deckRules.ts - this only turns validateDeck's verdict into the calm,
// short copy the Decks screen shows ("3 more to go", "Flame Imp ×3 - max 2", "Mira: not owned").

export type DeckState = 'ready' | 'building' | 'invalid';

export interface DeckStatus {
  state: DeckState;
  count: number;
  /** Cards still needed to reach DECK_SIZE (0 when full or over). */
  missing: number;
  /** Card ids currently over their copy limit. */
  overLimit: string[];
  /** Card ids the player doesn't own enough copies of. */
  unowned: string[];
  /** One short line for the current state - never an error dump. */
  message: string;
  /** True only when validateDeck agrees - the single gate for activating / fighting with a deck. */
  valid: boolean;
}

export function plural(n: number, word: string): string {
  if (n === 1) return `1 ${word}`;
  return `${n} ${word === 'hero' ? 'heroes' : `${word}s`}`;
}

export function countCopies(cardIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of cardIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function getDeckStatus(cardIds: string[], owned: OwnedMap = getCollection()): DeckStatus {
  const count = cardIds.length;
  const shortfalls = deckOwnershipShortfalls(cardIds, owned);
  const unowned = shortfalls.map((s) => s.cardId);
  const copies = countCopies(cardIds);
  const overLimit = [...copies.entries()].filter(([id, n]) => n > maxCopiesFor(id)).map(([id]) => id);
  const valid = validateDeck(cardIds).valid && shortfalls.length === 0;
  const missing = Math.max(0, DECK_SIZE - count);

  if (valid) return { state: 'ready', count, missing: 0, overLimit, unowned, valid, message: 'Ready for battle' };

  if (overLimit.length > 0) {
    const card = getCard(overLimit[0]);
    const limit = maxCopiesFor(card.id);
    const extra = overLimit.length > 1 ? ` (+${overLimit.length - 1} more)` : '';
    const message = card.rarity === 'legendary' ? `Only ${limit} Legendary — ${card.shortName} ×${copies.get(card.id)}${extra}` : `${card.shortName} ×${copies.get(card.id)} — max ${limit}${extra}`;
    return { state: 'invalid', count, missing, overLimit, unowned, valid, message };
  }

  if (shortfalls.length > 0) {
    const extra = shortfalls.length > 1 ? ` (+${shortfalls.length - 1} more)` : '';
    return { state: 'invalid', count, missing, overLimit, unowned, valid, message: `${describeShortfall(shortfalls[0])}${extra}` };
  }

  if (count > DECK_SIZE) return { state: 'invalid', count, missing: 0, overLimit, unowned, valid, message: `${plural(count - DECK_SIZE, 'card')} over ${DECK_SIZE}` };

  if (count === 0) return { state: 'building', count, missing, overLimit, unowned, valid, message: 'Empty — start filling it' };
  return { state: 'building', count, missing, overLimit, unowned, valid, message: `${plural(missing, 'more card')} to go` };
}

const RARITY_RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };

/** Deduplicated deck contents for tiles: heroes before spells, strongest rarity first, ties by name so order never jitters. */
export function sortedEntries(cardIds: string[]): { card: CardDefinition; count: number }[] {
  return [...countCopies(cardIds).entries()]
    .map(([id, count]) => ({ card: getCard(id), count }))
    .sort((a, b) => cardOrder(a.card, b.card));
}

export function cardOrder(a: CardDefinition, b: CardDefinition): number {
  if ((a.type === 'hero') !== (b.type === 'hero')) return a.type === 'hero' ? -1 : 1;
  return RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);
}

export function deckComposition(cardIds: string[]): { heroes: number; spells: number; legendary: number } {
  let heroes = 0;
  let spells = 0;
  let legendary = 0;
  for (const id of cardIds) {
    const c = getCard(id);
    if (c.type === 'hero') heroes += 1;
    else spells += 1;
    if (c.rarity === 'legendary') legendary += 1;
  }
  return { heroes, spells, legendary };
}
