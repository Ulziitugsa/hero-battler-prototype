import type { Rarity } from '../types/index.js';
import { grantCard } from '../collection/collection.js';
import { getCard } from '../cards/index.js';
import { PLAYTEST_ROSTER } from '../cards/roster.js';

export const PROTOTYPE_BOX = {
  id: 'moonfall-test-v1',
  name: 'Moonfall Box',
  packCount: 100,
  cardsPerPack: 5,
  // Per card: Common 14-15, Rare 8, Epic 6, Legendary 5, so rarer cards always take longer to reach Mastery V
  // (Common 1 Box, Rare and Epic 2, Legendary 3) and one full Box maxes only the Commons.
  cardCounts: { common: 258, rare: 168, epic: 54, legendary: 20 } satisfies Record<Rarity, number>,
} as const;

/** v2: rarity copies rebalanced (a v1 save holds the old per-card counts, so it is not carried over). */
export const PROTOTYPE_BOX_STORAGE_KEY = 'moonwater:testBox:moonfall-v2';
export type BoxRemaining = Record<string, number>;
/** `resetCount` was added after v1 shipped; older saves simply lack it and read as 0. */
export interface PrototypeBoxState { version: 1; openedPacks: number; randomState: number; remaining: BoxRemaining; resetCount?: number }
export interface PrototypeBoxContentLine { cardId: string; rarity: Rarity; remaining: number; total: number }
export interface PrototypeBoxPull { cardId: string; rarity: Rarity; previousCopies: number; ownedCopies: number; isNew: boolean }
export interface OpenBoxResult { state: PrototypeBoxState; packs: PrototypeBoxPull[][] }

const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const cardIds = [...new Set(PLAYTEST_ROSTER)].sort();
let snapshot: PrototypeBoxState | null = null;

function initialRemaining(): BoxRemaining {
  const result: BoxRemaining = {};
  for (const rarity of rarityOrder) {
    const eligible = cardIds.filter(id => getCard(id).rarity === rarity);
    if (!eligible.length) continue;
    const each = Math.floor(PROTOTYPE_BOX.cardCounts[rarity] / eligible.length);
    let extra = PROTOTYPE_BOX.cardCounts[rarity] % eligible.length;
    for (const id of eligible) result[id] = each + (extra-- > 0 ? 1 : 0);
  }
  return result;
}

function freshState(resetCount = 0): PrototypeBoxState {
  return { version: 1, openedPacks: 0, randomState: 0x4d4f4f4, remaining: initialRemaining(), resetCount };
}

function save(state: PrototypeBoxState): PrototypeBoxState {
  snapshot = state;
  try { localStorage.setItem(PROTOTYPE_BOX_STORAGE_KEY, JSON.stringify(state)); } catch { /* test economy is best effort */ }
  return state;
}

export function getPrototypeBoxState(): PrototypeBoxState {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(PROTOTYPE_BOX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PrototypeBoxState>;
      if (parsed.version === 1 && parsed.remaining && typeof parsed.remaining === 'object') {
        snapshot = { ...freshState(), ...parsed, remaining: { ...initialRemaining(), ...parsed.remaining } };
        return snapshot;
      }
    }
  } catch { /* create a fresh test box */ }
  snapshot = freshState();
  return snapshot;
}

function totalRemaining(remaining: BoxRemaining): number {
  return Object.values(remaining).reduce((sum, count) => sum + Math.max(0, count), 0);
}

export function prototypeBoxPacksRemaining(state = getPrototypeBoxState()): number {
  return Math.min(PROTOTYPE_BOX.packCount - state.openedPacks, Math.floor(totalRemaining(state.remaining) / PROTOTYPE_BOX.cardsPerPack));
}

export function prototypeBoxRarityCounts(state = getPrototypeBoxState()): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const [id, remaining] of Object.entries(state.remaining)) counts[getCard(id).rarity] += Math.max(0, remaining);
  return counts;
}

/** Probability that the NEXT card drawn is each rarity. Exact, because every remaining copy is equally likely. */
export function prototypeBoxNextCardOdds(state = getPrototypeBoxState()): Record<Rarity, number> {
  const counts = prototypeBoxRarityCounts(state);
  const total = counts.common + counts.rare + counts.epic + counts.legendary;
  const odds: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  if (total > 0) for (const rarity of rarityOrder) odds[rarity] = counts[rarity] / total;
  return odds;
}

/** Every card in the Box with its full-Box and remaining copy counts, rarest first. */
export function prototypeBoxContents(state = getPrototypeBoxState()): PrototypeBoxContentLine[] {
  const totals = initialRemaining();
  return Object.keys(totals)
    .map(cardId => ({ cardId, rarity: getCard(cardId).rarity, remaining: Math.max(0, state.remaining[cardId] ?? 0), total: totals[cardId] }))
    .sort((a, b) => rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity) || getCard(a.cardId).name.localeCompare(getCard(b.cardId).name));
}

/** The Box can be refilled once at least one pack has been opened; a full Box has nothing to refill. */
export function canResetPrototypeBox(state = getPrototypeBoxState()): boolean {
  return state.openedPacks > 0;
}

function nextRandom(state: number): { state: number; value: number } {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { state: next, value: next };
}

function draw(remaining: BoxRemaining, randomState: number): { cardId: string; randomState: number } {
  const total = totalRemaining(remaining);
  if (total < 1) throw new Error('The prototype Box has no cards left.');
  // Reject the short tail so each remaining physical copy has the same draw interval.
  const limit = Math.floor(0x100000000 / total) * total;
  let roll = nextRandom(randomState);
  while (roll.value >= limit) roll = nextRandom(roll.state);
  let target = roll.value % total;
  for (const id of cardIds) {
    const count = remaining[id] ?? 0;
    if (target < count) {
      remaining[id] = count - 1;
      return { cardId: id, randomState: roll.state };
    }
    target -= count;
  }
  throw new Error('The prototype Box contents are inconsistent.');
}

/** Opens 1 or 10 fixed five-card packs. Each physical card copy is removed from the finite pool. */
export function openPrototypeBox(packCount: 1 | 10): OpenBoxResult {
  const before = getPrototypeBoxState();
  if (prototypeBoxPacksRemaining(before) < packCount) throw new Error(`Only ${prototypeBoxPacksRemaining(before)} packs remain.`);
  const remaining = { ...before.remaining };
  let randomState = before.randomState;
  const packs: PrototypeBoxPull[][] = [];
  for (let pack = 0; pack < packCount; pack += 1) {
    const pulls: PrototypeBoxPull[] = [];
    for (let slot = 0; slot < PROTOTYPE_BOX.cardsPerPack; slot += 1) {
      const result = draw(remaining, randomState);
      randomState = result.randomState;
      const card = getCard(result.cardId);
      const grant = grantCard(result.cardId);
      if (!grant) throw new Error(`Could not add ${result.cardId} to the collection.`);
      pulls.push({ cardId: result.cardId, rarity: card.rarity, previousCopies: grant.previous, ownedCopies: grant.owned, isNew: grant.isNew });
    }
    packs.push(pulls);
  }
  const next = save({ ...before, openedPacks: before.openedPacks + packCount, randomState, remaining });
  return { state: next, packs };
}

/**
 * Refills this Box's finite pool to its full composition. It never modifies collection ownership: cards
 * already opened stay owned, and copies still sealed in the old Box are replaced by the fresh full set.
 * Player-facing callers must confirm first (see BoxDetail's reset dialog) - a Box never resets silently.
 */
export function resetPrototypeBox(): PrototypeBoxState {
  const previousResets = getPrototypeBoxState().resetCount ?? 0;
  snapshot = null;
  try { localStorage.removeItem(PROTOTYPE_BOX_STORAGE_KEY); } catch { /* best effort */ }
  snapshot = freshState(previousResets + 1);
  return save(snapshot);
}

export function reloadPrototypeBox(): void { snapshot = null; }

/** Dev/playtest full wipe (game/devReset.ts): a factory-fresh Box, including the reset count. */
export function clearPrototypeBox(): void {
  snapshot = null;
  try { localStorage.removeItem(PROTOTYPE_BOX_STORAGE_KEY); } catch { /* best effort */ }
}
