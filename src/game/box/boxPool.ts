import type { Rarity } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { grantCard } from '../collection/collection.js';
import { ARCHETYPE_BOX_IDS, fullBoxContents, isArchetypeBoxId, type ArchetypeBoxId } from './archetypeBoxes.js';

// Each archetype Box's finite pool, per account: the copies still sealed, how many pulls it has given and how often it
// was restocked. A pull draws one physical copy at random from what is left (every remaining copy equally likely) and
// removes it, so emptying a Box collects every copy in it, its Legendary included. No pity, no guaranteed slot, no bonus
// card. Pulls grant the cards to the collection and save the Box before they return: the reveal only shows them.
//
// Saved under one key for all nine Boxes. The retired Moonfall Box (one 100-pack Box of the whole 52-card roster) is not
// carried over: every Box starts full. save/launchSetMigration.ts records how many Moonfall packs a save had opened, so
// what that unlocked (the Gem bundles) stays unlocked.

export const ARCHETYPE_BOXES_STORAGE_KEY = 'moonwater:archetypeBoxes:v1';

export interface BoxPoolState {
  /** Sealed copies left, by card id. */
  remaining: Record<string, number>;
  /** Pulls taken from this Box, across restocks. */
  pulls: number;
  /** Times this Box was restocked (only possible once empty). */
  restockCount: number;
  randomState: number;
}

export interface ArchetypeBoxesState {
  version: 1;
  /** The Box a generic "pull" opens (Home's shortcut, a Ticket from elsewhere). */
  activeBoxId: ArchetypeBoxId;
  boxes: Partial<Record<ArchetypeBoxId, BoxPoolState>>;
  /** Moonfall packs a save had opened before the launch set (migration; unlocks only, never cards). */
  legacyMoonfallPacksOpened?: number;
}

export type PullCount = 1 | 10;

export interface BoxPull {
  cardId: string;
  rarity: Rarity;
  previousCopies: number;
  ownedCopies: number;
  isNew: boolean;
}

export interface BoxContentLine {
  cardId: string;
  rarity: Rarity;
  remaining: number;
  total: number;
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
let snapshot: ArchetypeBoxesState | null = null;

/** A stable seed per Box, so a fresh Box deals the same order on every account (and in tests). */
function seedOf(id: ArchetypeBoxId): number {
  let h = 0x4d4f4f4;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

function freshPool(id: ArchetypeBoxId, restockCount = 0, pulls = 0, randomState = seedOf(id)): BoxPoolState {
  return { remaining: { ...fullBoxContents(id) }, pulls, restockCount, randomState };
}

function freshState(): ArchetypeBoxesState {
  return { version: 1, activeBoxId: 'vanguard', boxes: {} };
}

/** A stored pool, repaired: unknown cards are dropped, counts clamp to the full Box (a save can never hold extra copies). */
function repairPool(id: ArchetypeBoxId, raw: Partial<BoxPoolState> | undefined): BoxPoolState {
  const full = fullBoxContents(id);
  if (!raw || typeof raw !== 'object' || !raw.remaining || typeof raw.remaining !== 'object') return freshPool(id);
  const remaining: Record<string, number> = {};
  for (const [cardId, total] of Object.entries(full)) {
    const n = Number((raw.remaining as Record<string, unknown>)[cardId]);
    remaining[cardId] = Number.isFinite(n) ? Math.max(0, Math.min(total, Math.floor(n))) : total;
  }
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);
  return { remaining, pulls: num(raw.pulls, 0), restockCount: num(raw.restockCount, 0), randomState: num(raw.randomState, seedOf(id)) >>> 0 };
}

export function getBoxesState(): ArchetypeBoxesState {
  if (snapshot) return snapshot;
  let state = freshState();
  try {
    const raw = localStorage.getItem(ARCHETYPE_BOXES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArchetypeBoxesState>;
      if (parsed && parsed.version === 1) {
        const boxes: ArchetypeBoxesState['boxes'] = {};
        for (const id of ARCHETYPE_BOX_IDS) if (parsed.boxes?.[id]) boxes[id] = repairPool(id, parsed.boxes[id]);
        state = {
          version: 1,
          activeBoxId: typeof parsed.activeBoxId === 'string' && isArchetypeBoxId(parsed.activeBoxId) ? parsed.activeBoxId : 'vanguard',
          boxes,
          ...(typeof parsed.legacyMoonfallPacksOpened === 'number' && parsed.legacyMoonfallPacksOpened > 0 ? { legacyMoonfallPacksOpened: Math.floor(parsed.legacyMoonfallPacksOpened) } : {}),
        };
      }
    }
  } catch {
    /* a fresh set of Boxes */
  }
  snapshot = state;
  return state;
}

function save(state: ArchetypeBoxesState): ArchetypeBoxesState {
  snapshot = state;
  try {
    localStorage.setItem(ARCHETYPE_BOXES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best effort, like the rest of the prototype economy */
  }
  return state;
}

/** One Box's pool (a Box never opened reads as full). */
export function getBoxPool(id: ArchetypeBoxId, state = getBoxesState()): BoxPoolState {
  return state.boxes[id] ?? freshPool(id);
}

export function boxCardsRemaining(id: ArchetypeBoxId, state = getBoxesState()): number {
  return Object.values(getBoxPool(id, state).remaining).reduce((sum, n) => sum + n, 0);
}

export function boxRarityRemaining(id: ArchetypeBoxId, state = getBoxesState()): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const [cardId, n] of Object.entries(getBoxPool(id, state).remaining)) counts[getCard(cardId).rarity] += n;
  return counts;
}

/** Probability that the NEXT card drawn is each rarity. Exact: every remaining copy is equally likely. */
export function boxNextCardOdds(id: ArchetypeBoxId, state = getBoxesState()): Record<Rarity, number> {
  const counts = boxRarityRemaining(id, state);
  const total = RARITY_ORDER.reduce((sum, r) => sum + counts[r], 0);
  const odds: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  if (total > 0) for (const r of RARITY_ORDER) odds[r] = counts[r] / total;
  return odds;
}

/** Every card in the Box with its full and remaining copies, rarest first. */
export function boxContents(id: ArchetypeBoxId, state = getBoxesState()): BoxContentLine[] {
  const pool = getBoxPool(id, state);
  return Object.entries(fullBoxContents(id))
    .map(([cardId, total]) => ({ cardId, rarity: getCard(cardId).rarity, remaining: pool.remaining[cardId] ?? 0, total }))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || getCard(a.cardId).name.localeCompare(getCard(b.cardId).name));
}

/** A pull of `count` needs that many sealed copies: a 10-pull is always exactly 10 cards. */
export function canPull(id: ArchetypeBoxId, count: PullCount, state = getBoxesState()): boolean {
  return boxCardsRemaining(id, state) >= count;
}

function nextRandom(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

/** Draws one copy from `remaining` (mutated). Card ids in the full Box's sorted order, so a draw is reproducible. */
function drawOne(id: ArchetypeBoxId, remaining: Record<string, number>, randomState: number): { cardId: string; randomState: number } {
  const total = Object.values(remaining).reduce((sum, n) => sum + n, 0);
  if (total < 1) throw new Error(`The ${id} Box is empty.`);
  // Reject the short tail so every remaining copy has the same chance.
  const limit = Math.floor(0x100000000 / total) * total;
  let roll = nextRandom(randomState);
  while (roll >= limit) roll = nextRandom(roll);
  let target = roll % total;
  for (const cardId of Object.keys(fullBoxContents(id))) {
    const n = remaining[cardId] ?? 0;
    if (target < n) {
      remaining[cardId] = n - 1;
      return { cardId, randomState: roll };
    }
    target -= n;
  }
  throw new Error(`The ${id} Box contents are inconsistent.`);
}

/** Exactly which cards the next `count` pulls of a Box would draw, without taking them (tests and previews). */
export function previewPulls(id: ArchetypeBoxId, count: number, state = getBoxesState()): string[] {
  const pool = getBoxPool(id, state);
  const remaining = { ...pool.remaining };
  let randomState = pool.randomState;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = drawOne(id, remaining, randomState);
    randomState = r.randomState;
    out.push(r.cardId);
  }
  return out;
}

export interface PullResult {
  state: ArchetypeBoxesState;
  pulls: BoxPull[];
}

/** Takes 1 or 10 cards from the Box, grants them and saves. Throws when the Box has fewer cards left than asked. */
export function pullFromBox(id: ArchetypeBoxId, count: PullCount): PullResult {
  const before = getBoxesState();
  const pool = getBoxPool(id, before);
  if (!canPull(id, count, before)) throw new Error(`Only ${boxCardsRemaining(id, before)} cards remain in this Box.`);
  const remaining = { ...pool.remaining };
  let randomState = pool.randomState;
  const pulls: BoxPull[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = drawOne(id, remaining, randomState);
    randomState = r.randomState;
    const grant = grantCard(r.cardId);
    if (!grant) throw new Error(`Could not add ${r.cardId} to the collection.`);
    pulls.push({ cardId: r.cardId, rarity: getCard(r.cardId).rarity, previousCopies: grant.previous, ownedCopies: grant.owned, isNew: grant.isNew });
  }
  const next = save({ ...before, boxes: { ...before.boxes, [id]: { ...pool, remaining, randomState, pulls: pool.pulls + count } } });
  return { state: next, pulls };
}

/** A Box can be restocked only once it is empty. */
export function canRestockBox(id: ArchetypeBoxId, state = getBoxesState()): boolean {
  return boxCardsRemaining(id, state) === 0;
}

/**
 * Restocks an empty Box to its original contents. The collection is untouched (nothing is taken back, nothing is
 * given) and there is no restock reward. The draw order continues from where the Box left off.
 */
export function restockBox(id: ArchetypeBoxId): ArchetypeBoxesState {
  const before = getBoxesState();
  if (!canRestockBox(id, before)) throw new Error('Only an empty Box can be restocked.');
  const pool = getBoxPool(id, before);
  return save({ ...before, boxes: { ...before.boxes, [id]: freshPool(id, pool.restockCount + 1, pool.pulls, pool.randomState) } });
}

export function getActiveBoxId(state = getBoxesState()): ArchetypeBoxId {
  return state.activeBoxId;
}

export function setActiveBoxId(id: ArchetypeBoxId): ArchetypeBoxesState {
  const before = getBoxesState();
  return before.activeBoxId === id ? before : save({ ...before, activeBoxId: id });
}

/** Pulls taken across all nine Boxes. */
export function totalBoxPulls(state = getBoxesState()): number {
  return ARCHETYPE_BOX_IDS.reduce((sum, id) => sum + (state.boxes[id]?.pulls ?? 0), 0);
}

/** Migration only (save/launchSetMigration.ts): remember that a save had opened Moonfall packs. */
export function recordLegacyMoonfallPacks(packs: number): void {
  if (!(packs > 0)) return;
  const before = getBoxesState();
  save({ ...before, legacyMoonfallPacksOpened: Math.max(before.legacyMoonfallPacksOpened ?? 0, Math.floor(packs)) });
}

export function reloadArchetypeBoxes(): void {
  snapshot = null;
}

/** Dev/playtest full wipe (game/devReset.ts): every Box factory-fresh. */
export function clearArchetypeBoxes(): void {
  snapshot = null;
  try {
    localStorage.removeItem(ARCHETYPE_BOXES_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}
