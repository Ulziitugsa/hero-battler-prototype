import { getCollection, getOwnedCount, removeCard } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { isDeckPlayable } from '../engine/activeDeck';
import { listDeckOptions, type DeckOption } from '../engine/deckOptions';
import { ascensionCost, MIN_COPIES_KEPT } from './config';
import { getCardAscension, maxRankFor } from './definitions';
import { getAscensionRank, getAscensionState, recordAscension, type AscensionState } from './store';
import { starsForCard } from './stars';
import { track } from '../../analytics/track';
import { getCard } from '../cards';
import { getHeroLevel } from '../heroLevel/store';
import { rosterPowerForHero } from '../heroLevel/rosterPower';

// Ascension rules, in one place. Ascending spends spare duplicates of the same card:
//   - the collection quantity IS the number of copies available, so spending lowers it directly (decks,
//     starter unlocks and Heroes all keep reading one number); the Ascension store remembers what was spent;
//   - the last usable copy is never spendable (MIN_COPIES_KEPT);
//   - it can never take a copy out from under a deck the player can currently use: every playable deck
//     (unlocked starters and valid saved decks) must still be fully covered after the spend. Nothing is
//     ever silently removed from or edited in a deck - the Ascension is simply blocked, with the reason.

export type AscendBlock = 'unsupported' | 'not-owned' | 'max-rank' | 'no-spare' | 'in-use';

export interface AscensionStatus {
  supported: boolean;
  owned: number;
  rank: number;
  maxRank: number;
  /** The rank an Ascend would reach; null at max (or unsupported). */
  nextRank: number | null;
  /** Duplicate copies the next rank costs. */
  cost: number | null;
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

export function getAscensionStatus(cardId: string, owned: OwnedMap = getCollection(), ascension: AscensionState = getAscensionState(), decks: DeckOption[] = listDeckOptions()): AscensionStatus {
  const supported = !!getCardAscension(cardId);
  const count = getOwnedCount(cardId, owned);
  const rank = getAscensionRank(cardId, ascension);
  const maxRank = maxRankFor(cardId);
  const nextRank = supported && rank < maxRank ? rank + 1 : null;
  const cost = nextRank ? ascensionCost(nextRank) : null;
  const { copies: demand, deck } = deckDemand(cardId, owned, decks);
  const keep = Math.max(MIN_COPIES_KEPT, demand);
  const spare = Math.max(0, count - keep);

  const base = { supported, owned: count, rank, maxRank, nextRank, cost, spare, blockingDeck: null as string | null };
  const blocked = (b: AscendBlock, reason: string, blockingDeck: string | null = null): AscensionStatus => ({ ...base, canAscend: false, blocked: b, reason, blockingDeck });

  if (!supported) return blocked('unsupported', 'Ascension coming later.');
  if (count <= 0) return blocked('not-owned', 'Collect this card to Ascend it.');
  if (nextRank === null || cost === null) return blocked('max-rank', 'Fully Ascended.');
  if (count - cost < MIN_COPIES_KEPT) {
    const need = cost + MIN_COPIES_KEPT - count;
    return blocked('no-spare', `Needs ${cost} spare ${cost === 1 ? 'copy' : 'copies'} — collect ${need} more.`);
  }
  if (count - cost < demand) {
    const short = demand - (count - cost);
    return blocked('in-use', `${deck} uses ${demand} ${demand === 1 ? 'copy' : 'copies'}. Remove ${short} from your decks or collect ${short} more first.`, deck);
  }
  return { ...base, canAscend: true, blocked: null, reason: null };
}

export interface AscendResult {
  ok: boolean;
  cardId: string;
  newRank: number;
  spent: number;
  reason: string | null;
}

/** Spends the duplicates and raises the rank - only if every rule in getAscensionStatus passes (re-checked here, never trusts the UI). */
export function ascendCard(cardId: string): AscendResult {
  const status = getAscensionStatus(cardId);
  if (!status.canAscend || status.nextRank === null || status.cost === null) {
    return { ok: false, cardId, newRank: status.rank, spent: 0, reason: status.reason };
  }
  const starsBefore = starsForCard(cardId);
  const card = getCard(cardId);
  const level = getHeroLevel(cardId);
  const rosterPowerBefore = card.power !== undefined ? rosterPowerForHero(card.power, level, status.rank) : 0;

  removeCard(cardId, status.cost);
  recordAscension(cardId, status.nextRank, status.cost);

  const starsAfter = starsForCard(cardId);
  const rosterPowerAfter = card.power !== undefined ? rosterPowerForHero(card.power, level, status.nextRank) : 0;

  track('duplicate_progress_applied', { cardId, system: 'ascension', rankBefore: status.rank, rankAfter: status.nextRank, duplicatesSpent: status.cost });
  track('hero_ascended', { cardId, rankBefore: status.rank, rankAfter: status.nextRank, duplicatesSpent: status.cost });
  if (starsAfter !== starsBefore) track('hero_star_changed', { cardId, starsBefore, starsAfter });
  if (rosterPowerAfter !== rosterPowerBefore) track('roster_power_changed', { cardId, source: 'ascension', rosterPowerBefore, rosterPowerAfter, delta: rosterPowerAfter - rosterPowerBefore });

  return { ok: true, cardId, newRank: status.nextRank, spent: status.cost, reason: null };
}

/** Player-facing name of a rank. */
export const ascensionLabel = (rank: number): string => (rank <= 0 ? 'Base' : `Ascension ${['I', 'II', 'III', 'IV'][rank - 1] ?? rank}`);
export const ascensionNumeral = (rank: number): string => ['', 'I', 'II', 'III', 'IV'][rank] ?? String(rank);

