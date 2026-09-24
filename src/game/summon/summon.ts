import { getAscensionStatus } from '../ascension/ascend';
import { getCollection, grantCard } from '../collection/collection';
import { getStarterDeckUnlockProgress, starterDeckId } from '../collection/starterUnlock';
import type { GrantResult, OwnedMap } from '../collection/types';
import { STARTER_DECK_NAMES, type StarterFaction } from '../cards/starterDecks';
import { canAfford, canAffordTickets, commitSummon, getGems, getPity, getTickets } from '../economy/economy';
import type { SummonHistoryEntry } from '../economy/types';
import { makeSeed } from '../engine/rng';
import type { Rarity } from '../types';
import { SUMMON_CONFIG, SUMMON_RARITY_ORDER } from './config';
import { takeForcedRarity } from './devControls';
import { getPool, type SummonPool } from './pool';
import { resolveSummons, type SummonPullResult } from './resolve';
import { track } from '../../analytics/track';

// The Summon flow, in one place: check affordability -> resolve (pure) -> spend + pity + history (one
// economy write) -> grant every card through the collection store. Everything is decided and persisted
// HERE, before any presentation starts; the reveal animation only reads the returned outcome and can never
// change what was pulled. The UI only calls performSummon and renders what it returns.

export type SummonKind = 'single' | 'ten';
export type SummonCurrency = 'gems' | 'tickets';

export const SUMMON_COUNTS: Record<SummonKind, number> = { single: 1, ten: SUMMON_CONFIG.tenCount };

/** Gem cost is per-banner (SummonPool.cost); Ticket cost is flat and banner-independent - see summon/config.ts. */
export function summonCost(pool: SummonPool, kind: SummonKind, currency: SummonCurrency = 'gems'): number {
  if (currency === 'tickets') return kind === 'single' ? SUMMON_CONFIG.ticketCost.single : SUMMON_CONFIG.ticketCost.ten;
  return kind === 'single' ? pool.cost.single : pool.cost.ten;
}

export interface SummonPull extends SummonPullResult {
  grant: GrantResult;
  /** A duplicate that leaves this card with an Ascension available (never auto-applied). */
  ascensionAvailable: boolean;
}

export interface StarterProgressNote {
  deckId: string;
  name: string;
  collected: number;
  total: number;
  unlockedNow: boolean;
}

export interface SummonSuccess {
  ok: true;
  kind: SummonKind;
  bannerId: string;
  seed: number;
  currency: SummonCurrency;
  cost: number;
  pulls: SummonPull[];
  pityBefore: number;
  pityAfter: number;
  /** Highest rarity in the batch - what the opening animation telegraphs for a 10x. */
  highestRarity: Rarity;
  /** Locked starter decks these pulls moved (or unlocked). */
  starterProgress: StarterProgressNote[];
}

export type SummonOutcome = { ok: false; reason: 'insufficient'; currency: SummonCurrency; need: number; have: number } | SummonSuccess;

const FACTIONS = Object.keys(STARTER_DECK_NAMES) as StarterFaction[];

export function highestRarityOf(rarities: readonly Rarity[]): Rarity {
  return rarities.reduce<Rarity>((best, r) => (SUMMON_RARITY_ORDER.indexOf(r) > SUMMON_RARITY_ORDER.indexOf(best) ? r : best), 'common');
}

/** How a batch of grants moved every starter deck that was still locked beforehand and gained from it. */
function starterProgressBetween(before: OwnedMap, after: OwnedMap): StarterProgressNote[] {
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

/** `seed` is injectable so tests and dev tools are deterministic; the UI omits it and gets a fresh one.
 * `currency` picks what pays for it - Gems or Tickets - but never changes what gets pulled: both go
 * through the exact same resolveSummons/pity/history path below (see commitSummon's own note). Kept as
 * the LAST parameter, after `seed`, so every existing `performSummon(kind, bannerId, seed)` call site
 * keeps working unchanged and defaults to Gems. */
export function performSummon(kind: SummonKind, bannerId: string, seed: number = makeSeed(), currency: SummonCurrency = 'gems'): SummonOutcome {
  const pool = getPool(bannerId);
  const count = SUMMON_COUNTS[kind];
  const cost = summonCost(pool, kind, currency);
  const afford = currency === 'gems' ? canAfford(cost) : canAffordTickets(cost);
  if (!afford) return { ok: false, reason: 'insufficient', currency, need: cost, have: currency === 'gems' ? getGems() : getTickets() };

  const before = getCollection();
  const pityBefore = getPity(pool.id);
  // Dev-only forced rarity (null in production): a single is forced; a 10x forces slot 6 so mid-sequence pacing can be inspected.
  const forcedRarity = takeForcedRarity();
  const forced = forcedRarity ? { rarity: forcedRarity, index: count === 1 ? 0 : 5 } : null;
  const { pulls: results, pityAfter } = resolveSummons(pool, { pity: pityBefore }, count, seed, forced);

  // Was each pull a first copy? Decided up front from the collection + earlier pulls in this batch, so
  // history is written in the same single economy commit as the spend.
  const seen = new Set<string>();
  const now = Date.now();
  const history: SummonHistoryEntry[] = results.map((r) => {
    const wasNew = (before[r.cardId] ?? 0) === 0 && !seen.has(r.cardId);
    seen.add(r.cardId);
    return { cardId: r.cardId, rarity: r.rarity, at: now, wasNew, bannerId: pool.id };
  });

  if (!commitSummon(cost, pool.id, pityAfter, history, currency)) return { ok: false, reason: 'insufficient', currency, need: cost, have: currency === 'gems' ? getGems() : getTickets() };

  const grants = results.map((r) => grantCard(r.cardId, 1));
  const after = getCollection();
  const pulls: SummonPull[] = [];
  results.forEach((r, i) => {
    const grant = grants[i];
    if (!grant) return; // unreachable for a validated pool (every id is a real card)
    pulls.push({ ...r, grant, ascensionAvailable: !grant.isNew && getAscensionStatus(r.cardId, after).canAscend });
  });

  const highestRarity = highestRarityOf(pulls.map((p) => p.rarity));
  track('summon_performed', { kind, bannerId: pool.id, currency, cost, count: pulls.length, highestRarity });
  if (currency === 'tickets') track('summon_ticket_used', { bannerId: pool.id, count: cost });
  for (const pull of pulls) {
    if (pull.rarity === 'legendary') track('legendary_pulled', { bannerId: pool.id, cardId: pull.cardId, wasNew: pull.grant.isNew, pityAfter });
    if (!pull.grant.isNew) track('duplicate_acquired', { cardId: pull.cardId, rarity: pull.rarity, source: 'summon', copiesOwned: pull.grant.owned, ascensionAvailable: pull.ascensionAvailable });
  }

  return {
    ok: true,
    kind,
    bannerId: pool.id,
    seed,
    currency,
    cost,
    pulls,
    pityBefore,
    pityAfter,
    highestRarity,
    starterProgress: starterProgressBetween(before, after),
  };
}
