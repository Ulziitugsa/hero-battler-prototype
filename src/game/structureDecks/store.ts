import { track } from '../../analytics/track';
import { grantCard } from '../collection/collection';
import { canAfford, spendGems } from '../economy/economy';
import { loadSavedDecks, upsertSavedDeck } from '../engine/localDecks';
import type { StructureDeckDef } from './definitions';

// Structure Deck purchases: how many times each deck was bought. Stored under its own key, so saves
// from before Structure Decks existed simply read as "nothing bought yet".

export const STRUCTURE_DECK_STORAGE_KEY = 'moonwater:structure-decks';

export interface StructureDeckState { version: 1; purchased: Record<string, number> }

let snapshot: StructureDeckState | null = null;
const listeners = new Set<() => void>();

function emit(): void { for (const listener of [...listeners]) listener(); }

function load(): StructureDeckState {
  try {
    const raw = localStorage.getItem(STRUCTURE_DECK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StructureDeckState>;
      if (parsed.version === 1 && parsed.purchased && typeof parsed.purchased === 'object') {
        const purchased: Record<string, number> = {};
        for (const [id, count] of Object.entries(parsed.purchased)) if (Number.isInteger(count) && count > 0) purchased[id] = count;
        return { version: 1, purchased };
      }
    }
  } catch { /* start with nothing purchased */ }
  return { version: 1, purchased: {} };
}

export function getStructureDeckState(): StructureDeckState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeStructureDecks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function structureDeckPurchases(id: string, state = getStructureDeckState()): number {
  return state.purchased[id] ?? 0;
}

export function savedStructureDeckId(deck: StructureDeckDef): string {
  return `structure-${deck.id}`;
}

export type BuyStructureDeckResult =
  | { ok: true; gems: number; newCards: number; savedDeckId: string }
  | { ok: false; reason: 'limit-reached' | 'not-enough-gems' };

/**
 * Spends Gems, adds every card in the deck to the collection and saves the list as a ready-to-play deck.
 * The saved deck is only created if the player does not already have one with this id, so a deck the
 * player has since edited is never overwritten.
 */
export function buyStructureDeck(deck: StructureDeckDef): BuyStructureDeckResult {
  const state = getStructureDeckState();
  const bought = structureDeckPurchases(deck.id, state);
  if (bought >= deck.purchaseLimit) return { ok: false, reason: 'limit-reached' };
  if (!canAfford(deck.priceGems) || !spendGems(deck.priceGems)) return { ok: false, reason: 'not-enough-gems' };

  const next: StructureDeckState = { version: 1, purchased: { ...state.purchased, [deck.id]: bought + 1 } };
  snapshot = next;
  try { localStorage.setItem(STRUCTURE_DECK_STORAGE_KEY, JSON.stringify(next)); } catch { /* purchase still applies this session */ }

  let newCards = 0;
  for (const cardId of deck.cardIds) if (grantCard(cardId)?.isNew) newCards += 1;
  const savedDeckId = savedStructureDeckId(deck);
  if (!loadSavedDecks().some(saved => saved.id === savedDeckId)) upsertSavedDeck({ id: savedDeckId, name: deck.name, faction: deck.faction, cardIds: [...deck.cardIds] });

  emit();
  track('structure_deck_purchased', { deckId: deck.id, gems: deck.priceGems, cardCount: deck.cardIds.length, newCards });
  track('shop_purchase_simulated', { productId: `structure-deck:${deck.id}`, productType: 'structure_deck', simulated: false, gems: deck.priceGems });
  return { ok: true, gems: deck.priceGems, newCards, savedDeckId };
}

/** Dev/playtest only (game/devReset.ts). */
export function resetStructureDecks(): void {
  snapshot = null;
  try { localStorage.removeItem(STRUCTURE_DECK_STORAGE_KEY); } catch { /* ignore */ }
  emit();
}
