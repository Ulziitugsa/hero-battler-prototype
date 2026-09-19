import { getCard } from '../cards';
import { getCollection, getOwnedCount } from './collection';
import type { OwnedMap } from './types';

export interface OwnershipShortfall {
  cardId: string;
  /** Copies the deck asks for / copies the player owns. */
  need: number;
  have: number;
}

/**
 * Cards a deck uses that the player doesn't own enough of. Compares against OWNED copies only - the
 * game's own copy limit (max 2 / 1 Legendary) is checked separately by validateDeck.
 */
export function deckOwnershipShortfalls(cardIds: string[], owned: OwnedMap = getCollection()): OwnershipShortfall[] {
  const need = new Map<string, number>();
  for (const id of cardIds) need.set(id, (need.get(id) ?? 0) + 1);
  const out: OwnershipShortfall[] = [];
  for (const [cardId, n] of need) {
    const have = getOwnedCount(cardId, owned);
    if (have < n) out.push({ cardId, need: n, have });
  }
  return out;
}

/** Short player-facing line for a shortfall - never a raw id. */
export function describeShortfall(s: OwnershipShortfall): string {
  const name = getCard(s.cardId).shortName;
  return s.have === 0 ? `${name}: not owned` : `You own ${s.have} ${name}, deck needs ${s.need}`;
}
