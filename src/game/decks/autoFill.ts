import type { CardDefinition, Faction } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { DECK_SIZE, maxCopiesFor } from '../engine/deckRules.js';
import { baseAtk } from './deckSummary.js';

// "Fill deck": a deterministic, template-based completion of a partly built deck - not an AI and not
// a recommendation engine. It only uses cards the player owns, never exceeds copy limits, keeps every
// card already chosen, and aims for the same 11 Unit / 4 Spell shape the starter decks use. Same
// inputs always give the same deck.

export const TARGET_UNITS = 11;

const RARITY_RANK = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;

function rank(faction: Faction) {
  return (a: CardDefinition, b: CardDefinition) =>
    Number(b.faction === faction) - Number(a.faction === faction) ||
    RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] ||
    (baseAtk(b) ?? 0) - (baseAtk(a) ?? 0) ||
    a.name.localeCompare(b.name);
}

/**
 * Returns the ids to ADD (not the whole deck). `pool` is the eligible card set (the playtest roster);
 * `ownedCount` says how many copies the player has.
 */
export function autoFillDeck(cardIds: readonly string[], pool: readonly string[], ownedCount: (cardId: string) => number, faction: Faction, deckSize = DECK_SIZE): string[] {
  const inDeck = new Map<string, number>();
  for (const id of cardIds) inDeck.set(id, (inDeck.get(id) ?? 0) + 1);
  const room = (id: string) => Math.max(0, Math.min(ownedCount(id), maxCopiesFor(id)) - (inDeck.get(id) ?? 0));

  const cards = pool.map(getCard).filter((c) => room(c.id) > 0);
  const units = cards.filter((c) => c.type === 'hero').sort(rank(faction));
  const spells = cards.filter((c) => c.type !== 'hero').sort(rank(faction));

  const added: string[] = [];
  let open = Math.max(0, deckSize - cardIds.length);
  const unitsNow = cardIds.filter((id) => getCard(id).type === 'hero').length;
  let unitsWanted = Math.min(open, Math.max(0, TARGET_UNITS - unitsNow));

  const take = (list: CardDefinition[], want: number) => {
    for (const c of list) {
      while (want > 0 && open > 0 && room(c.id) > 0) {
        added.push(c.id);
        inDeck.set(c.id, (inDeck.get(c.id) ?? 0) + 1);
        want -= 1;
        open -= 1;
      }
    }
  };

  take(units, unitsWanted);
  take(spells, open);
  // Not enough Spells owned: top up with more Units rather than leave the deck short.
  unitsWanted = open;
  take(units, unitsWanted);
  return added;
}
