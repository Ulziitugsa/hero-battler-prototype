import { getCollection, getOwnedCount, removeCard } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { isDeckPlayable } from '../engine/activeDeck';
import { listDeckOptions, type DeckOption } from '../engine/deckOptions';
import { ascensionCost, MIN_COPIES_KEPT } from './config';
import { hasMasteryPath, maxMasteryRank } from './path';
import { getAscensionRank, getAscensionState, recordAscension, type AscensionState } from './store';
import { track } from '../../analytics/track';
import { getConfig } from '../../config/config';
import { canAffordGold, getGold, spendGold } from '../economy/economy';

// Card Mastery rules (stored as the legacy Ascension rank), in one place. Advancing spends spare duplicates of the same
// card, plus a Gold fee for Mastery IV and V (ascension/config.ts):
//   - the collection quantity IS the number of copies available, so spending lowers it directly (decks,
//     starter unlocks and Heroes all keep reading one number); the Ascension store remembers what was spent;
//   - the last usable copy is never spendable (MIN_COPIES_KEPT);
//   - it can never take a copy out from under a deck the player can currently use: every playable deck
//     (unlocked starters and valid saved decks) must still be fully covered after the spend. Nothing is
//     ever silently removed from or edited in a deck - the Ascension is simply blocked, with the reason.

export type AscendBlock = 'unsupported' | 'not-owned' | 'max-rank' | 'no-spare' | 'in-use' | 'no-gold';

/** Gold the advance to `toRank` costs on top of its duplicates (0 for Mastery II and III). */
export function masteryGoldFee(toRank: number): number {
  const fee = getConfig().economy.masteryGoldFee[toRank - 1] ?? 0;
  return Number.isFinite(fee) ? Math.max(0, Math.floor(fee)) : 0;
}

export interface AscensionStatus {
  supported: boolean;
  owned: number;
  rank: number;
  maxRank: number;
  /** The rank an Ascend would reach; null at max (or unsupported). */
  nextRank: number | null;
  /** Duplicate copies the next rank costs. */
  cost: number | null;
  /** Gold the next rank costs on top of the duplicates (0 when none). */
  goldCost: number;
  /** Copies not needed by any usable deck and beyond the one that must stay: what can be spent right now. */
  spare: number;
  canAscend: boolean;
  blocked: AscendBlock | null;
  /** Player-facing explanation when blocked. */
  reason: string | null;
  /** The deck that would be broken, when blocked by 'in-use'. */
  blockingDeck: string | null;
}

/** Most copies of `cardId` any currently-usable deck needs, and the first deck that needs that many. */
function deckDemand(cardId: string, owned: OwnedMap, decks: DeckOption[]): { copies: number; deck: string | null } {
  let copies = 0;
  let deck: string | null = null;
  for (const d of decks) {
    if (!isDeckPlayable(d.cardIds, owned)) continue; // a deck that isn't usable now can't be "broken" by this
    const n = d.cardIds.filter((id) => id === cardId).length;
    if (n > copies) {
      copies = n;
      deck = d.label;
    }
  }
  return { copies, deck };
}

export function getAscensionStatus(cardId: string, owned: OwnedMap = getCollection(), ascension: AscensionState = getAscensionState(), decks: DeckOption[] = listDeckOptions(), gold: number = getGold()): AscensionStatus {
  const supported = hasMasteryPath(cardId);
  const count = getOwnedCount(cardId, owned);
  const rank = getAscensionRank(cardId, ascension);
  const maxRank = maxMasteryRank(cardId);
  const nextRank = supported && rank < maxRank ? rank + 1 : null;
  const cost = nextRank ? ascensionCost(nextRank) : null;
  const goldCost = nextRank ? masteryGoldFee(nextRank) : 0;
  const { copies: demand, deck } = deckDemand(cardId, owned, decks);
  const keep = Math.max(MIN_COPIES_KEPT, demand);
  const spare = Math.max(0, count - keep);

  const base = { supported, owned: count, rank, maxRank, nextRank, cost, goldCost, spare, blockingDeck: null as string | null };
  const blocked = (b: AscendBlock, reason: string, blockingDeck: string | null = null): AscensionStatus => ({ ...base, canAscend: false, blocked: b, reason, blockingDeck });

  if (!supported) return blocked('unsupported', 'This card has no Mastery path.');
  if (count <= 0) return blocked('not-owned', 'Collect this card to raise its Mastery.');
  if (nextRank === null || cost === null) return blocked('max-rank', 'Mastery V reached.');
  if (count - cost < MIN_COPIES_KEPT) {
    const need = cost + MIN_COPIES_KEPT - count;
    return blocked('no-spare', `Needs ${cost} spare ${cost === 1 ? 'copy' : 'copies'} — collect ${need} more.`);
  }
  if (count - cost < demand) {
    const short = demand - (count - cost);
    return blocked('in-use', `${deck} uses ${demand} ${demand === 1 ? 'copy' : 'copies'}. Remove ${short} from your decks or collect ${short} more first.`, deck);
  }
  if (goldCost > 0 && !canAffordGold(goldCost, gold)) return blocked('no-gold', `Needs ${goldCost.toLocaleString('en-US')} Gold — you have ${gold.toLocaleString('en-US')}.`);
  return { ...base, canAscend: true, blocked: null, reason: null };
}

export interface AscendResult {
  ok: boolean;
  cardId: string;
  newRank: number;
  spent: number;
  goldSpent: number;
  reason: string | null;
}

/** Spends the duplicates and raises the rank - only if every rule in getAscensionStatus passes (re-checked here, never trusts the UI). */
export function ascendCard(cardId: string): AscendResult {
  const status = getAscensionStatus(cardId);
  if (!status.canAscend || status.nextRank === null || status.cost === null) {
    return { ok: false, cardId, newRank: status.rank, spent: 0, goldSpent: 0, reason: status.reason };
  }
  // Gold first: it is the only step that can still refuse (status checked it, but the balance is re-read here), and a
  // refused spend changes nothing. Duplicates and the new stage follow.
  if (status.goldCost > 0 && !spendGold(status.goldCost)) {
    return { ok: false, cardId, newRank: status.rank, spent: 0, goldSpent: 0, reason: 'Not enough Gold.' };
  }
  removeCard(cardId, status.cost);
  recordAscension(cardId, status.nextRank, status.cost);

  track('duplicate_progress_applied', { cardId, system: 'ascension', rankBefore: status.rank, rankAfter: status.nextRank, duplicatesSpent: status.cost });
  track('hero_ascended', { cardId, rankBefore: status.rank, rankAfter: status.nextRank, duplicatesSpent: status.cost });

  return { ok: true, cardId, newRank: status.nextRank, spent: status.cost, goldSpent: status.goldCost, reason: null };
}

/** Player-facing name of a stored rank: rank 0..4 = "Mastery I".."Mastery V". */
export const ascensionLabel = (rank: number): string => `Mastery ${ascensionNumeral(rank)}`;
/** The Mastery numeral of a stored rank (rank 1 = "II"). */
export const ascensionNumeral = (rank: number): string => ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, Math.floor(rank)))] ?? 'I';
