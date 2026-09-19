import { getCard } from '../cards';
import { STARTER_DECK_NAMES, STARTER_DECKS, type StarterFaction } from '../cards/starterDecks';
import { getCollection } from './collection';
import type { OwnedMap } from './types';

// Starter decks unlock from the collection alone: a starter deck is player-usable exactly when the
// player owns enough copies of every card it needs. The deck definition (starterDecks.ts) is the source
// of truth - there is no separate "unlocked" flag to store, claim or drift out of sync.

const FACTIONS = Object.keys(STARTER_DECKS) as StarterFaction[];

export const starterDeckId = (faction: StarterFaction): string => `starter-${faction}`;

export function starterFactionOf(deckId: string): StarterFaction | null {
  const f = deckId.replace(/^starter-/, '') as StarterFaction;
  return deckId.startsWith('starter-') && FACTIONS.includes(f) ? f : null;
}

export interface StarterRequirement {
  cardId: string;
  need: number;
  have: number;
  met: boolean;
}

export interface StarterUnlockProgress {
  deckId: string;
  faction: StarterFaction;
  name: string;
  requirements: StarterRequirement[];
  /** Copies collected toward the deck (each requirement counts at most its `need`) / copies the deck needs. */
  collected: number;
  total: number;
  unlocked: boolean;
}

export function getStarterDeckUnlockProgress(deckId: string, owned: OwnedMap = getCollection()): StarterUnlockProgress | null {
  const faction = starterFactionOf(deckId);
  if (!faction) return null;
  const need = new Map<string, number>();
  for (const id of STARTER_DECKS[faction]) need.set(id, (need.get(id) ?? 0) + 1);
  const requirements: StarterRequirement[] = [...need].map(([cardId, n]) => {
    const have = owned[cardId] ?? 0;
    return { cardId, need: n, have, met: have >= n };
  });
  requirements.sort((a, b) => {
    const ca = getCard(a.cardId);
    const cb = getCard(b.cardId);
    const rank = { legendary: 0, epic: 1, rare: 2, common: 3 };
    return (ca.type === 'hero' ? 0 : 1) - (cb.type === 'hero' ? 0 : 1) || rank[ca.rarity] - rank[cb.rarity] || ca.name.localeCompare(cb.name);
  });
  return {
    deckId,
    faction,
    name: STARTER_DECK_NAMES[faction],
    requirements,
    collected: requirements.reduce((sum, r) => sum + Math.min(r.have, r.need), 0),
    total: STARTER_DECKS[faction].length,
    unlocked: requirements.every((r) => r.met),
  };
}

export function isStarterDeckUnlocked(deckId: string, owned: OwnedMap = getCollection()): boolean {
  return getStarterDeckUnlockProgress(deckId, owned)?.unlocked ?? false;
}

export interface StarterProgressUpdate {
  deckId: string;
  name: string;
  collected: number;
  total: number;
  /** True when this very grant completed the deck's requirements. */
  unlockedNow: boolean;
}

/**
 * How a collection change moved the starter decks the given card counts toward. Returns the most
 * relevant deck (one that just unlocked, else the first that was still locked before the change), or null
 * when the card isn't part of any starter deck that was still locked.
 */
export function getStarterProgressUpdate(cardId: string, before: OwnedMap, after: OwnedMap): StarterProgressUpdate | null {
  const updates: StarterProgressUpdate[] = [];
  for (const faction of FACTIONS) {
    if (!STARTER_DECKS[faction].includes(cardId)) continue;
    const id = starterDeckId(faction);
    const b = getStarterDeckUnlockProgress(id, before);
    const a = getStarterDeckUnlockProgress(id, after);
    if (!a || !b || b.unlocked) continue;
    updates.push({ deckId: id, name: a.name, collected: a.collected, total: a.total, unlockedNow: a.unlocked });
  }
  return updates.find((u) => u.unlockedNow) ?? updates[0] ?? null;
}
