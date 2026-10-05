import { getStarterDeckUnlockProgress, starterDeckId } from '../collection/starterUnlock';
import type { OwnedMap } from '../collection/types';
import { STARTER_DECK_NAMES, type StarterFaction } from '../cards/starterDecks';
import type { Rarity } from '../types';
import { bestRarity } from './sequence';

// What the reveal ceremony shows: cards that are ALREADY granted and saved (the Box opening decides and persists them
// first). The ceremony and Pull Results only read this; nothing here can change what was opened.

export interface RevealCard {
  cardId: string;
  rarity: Rarity;
  isNew: boolean;
  /** Copies owned after this opening. */
  owned: number;
}

export interface StarterProgressNote {
  deckId: string;
  name: string;
  collected: number;
  total: number;
  unlockedNow: boolean;
}

export interface RevealOutcome {
  /** The Box the cards came from (shown on the ceremony). */
  boxName: string;
  cards: RevealCard[];
  highestRarity: Rarity;
  /** Locked starter decks these cards moved (or unlocked). */
  starterProgress: StarterProgressNote[];
}

const FACTIONS = Object.keys(STARTER_DECK_NAMES) as StarterFaction[];

/** How a batch of grants moved every starter deck that was still locked beforehand and gained from it. */
export function starterProgressBetween(before: OwnedMap, after: OwnedMap): StarterProgressNote[] {
  const notes: StarterProgressNote[] = [];
  for (const faction of FACTIONS) {
    const id = starterDeckId(faction);
    const b = getStarterDeckUnlockProgress(id, before);
    const a = getStarterDeckUnlockProgress(id, after);
    if (!a || !b || b.unlocked || a.collected === b.collected) continue;
    notes.push({ deckId: id, name: a.name, collected: a.collected, total: a.total, unlockedNow: a.unlocked });
  }
  return notes;
}

/** The reveal of one pull (1 card) or one 10-pull (10 cards), in the order the cards were drawn. */
export function pullRevealOutcome(boxName: string, cards: readonly { cardId: string; rarity: Rarity; isNew: boolean; ownedCopies: number }[], starterProgress: StarterProgressNote[] = []): RevealOutcome {
  const list = cards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: c.isNew, owned: c.ownedCopies }));
  return { boxName, cards: list, highestRarity: bestRarity(list.map((c) => c.rarity)), starterProgress };
}
