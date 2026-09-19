import type { GameEvent, GameState } from '../types';
import type { MatchStats } from '../engine/stats';
import { STARTING_HP } from '../engine/constants';
import type { CampaignNodeDef, CampaignObjectiveDef, CampaignRewardDef } from './types';
import { CHAPTER_1 } from './chapter1';
import { grantCard } from '../collection/collection';
import type { GrantResult } from '../collection/types';

// Campaign node-clearing progress. localStorage-only, following the same convention as
// localDecks.ts/preferences.ts (try/catch-wrapped, sane defaults, never throws).

const STORAGE_KEY = 'skyloom:campaignProgress';

export interface CampaignProgress {
  clearedNodes: string[];
  /** Best-ever objective ids earned per node - a seal, once pressed, stays pressed even if a later replay misses it. */
  objectivesMet: Record<string, string[]>;
  firstClearClaimed: string[];
}

function defaultProgress(): CampaignProgress {
  return { clearedNodes: [], objectivesMet: {}, firstClearClaimed: [] };
}

export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<CampaignProgress>;
    return { clearedNodes: parsed.clearedNodes ?? [], objectivesMet: parsed.objectivesMet ?? {}, firstClearClaimed: parsed.firstClearClaimed ?? [] };
  } catch {
    return defaultProgress();
  }
}

function saveProgress(progress: CampaignProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // best-effort only
  }
}

export function isNodeCleared(nodeId: string, progress: CampaignProgress): boolean {
  return progress.clearedNodes.includes(nodeId);
}

/** A node is reachable once every node it `requires` is cleared - the optional challenge spur requires
 * exactly one main-road node and never appears in anything else's `requires`, so clearing it or not
 * never blocks the road (see types.ts's CampaignNodeDef.optional doc). */
export function isNodeUnlocked(node: CampaignNodeDef, progress: CampaignProgress): boolean {
  return node.requires.every((id) => isNodeCleared(id, progress));
}

/** The next main-road node still to clear - the map's "current" gold marker and the Home Fight sheet's
 * "Next: X" line. Null once every main-road node (everything but the optional spur) is cleared. */
export function getCurrentNodeId(progress: CampaignProgress): string | null {
  const next = CHAPTER_1.nodes.find((n) => !n.optional && !isNodeCleared(n.id, progress));
  return next?.id ?? null;
}

export function isChapterComplete(progress: CampaignProgress): boolean {
  return getCurrentNodeId(progress) === null;
}

export function findNode(nodeId: string): CampaignNodeDef | undefined {
  return CHAPTER_1.nodes.find((n) => n.id === nodeId);
}

// ---- Objective checks -------------------------------------------------------------------------
// Kept as a lookup table rather than storing functions on node data, so campaign content
// (chapter1.ts) stays plain serializable data. Every check reads only what the real match already
// reports (MatchStats, or the raw event log for per-side detail MatchStats doesn't split out) -
// nothing here simulates or re-plays anything.

export interface ObjectiveContext {
  stats: MatchStats;
  events: GameEvent[];
  playerDeckFaction: string;
}

const OBJECTIVE_CHECKS: Record<string, (ctx: ObjectiveContext, value: number | undefined) => boolean> = {
  roundsWithin: (ctx, value) => value !== undefined && ctx.stats.roundsPlayed <= value,
  healthAtLeast: (ctx, value) => value !== undefined && ctx.stats.finalPlayerHp >= value,
  noHeroLost: (ctx) => !ctx.events.some((e) => e.type === 'HERO_DESTROYED' && e.side === 'player'),
  overflowDealtAtLeast: (ctx, value) => {
    if (value === undefined) return false;
    const dealt = ctx.events.filter((e) => e.type === 'OVERFLOW_DAMAGE' && e.side === 'enemy').reduce((sum, e) => sum + (e as Extract<GameEvent, { type: 'OVERFLOW_DAMAGE' }>).amount, 0);
    return dealt >= value;
  },
  deckFactionKingdom: (ctx) => ctx.playerDeckFaction === 'kingdom',
};

export function evaluateObjective(def: CampaignObjectiveDef, ctx: ObjectiveContext): boolean {
  const check = OBJECTIVE_CHECKS[def.check];
  return check ? check(ctx, def.value) : false;
}

// ---- Recording a completed battle --------------------------------------------------------------

export interface BattleResultOutcome {
  node: CampaignNodeDef;
  won: boolean;
  isFirstClear: boolean;
  objectivesMet: { id: string; text: string; met: boolean; newlyEarned: boolean }[];
  reward: { firstClear: boolean; def: CampaignRewardDef } | null;
  /** Set when this clear's first-clear reward was a card and it was added to the collection (isNew tells NEW vs duplicate). */
  cardGrant: GrantResult | null;
  chapterComplete: boolean;
}

/** Call once, right when a Campaign battle's match ends (GamePage's onMatchEnd) - a win marks the node
 * cleared and its earned objectives permanent; a loss changes nothing (Energy already spent is not
 * refunded, see energy.ts). Never called for Quick Battle, which doesn't touch Campaign state at all. */
export function recordBattleResult(nodeId: string, status: GameState['status'], stats: MatchStats, events: GameEvent[], playerDeckFaction: string): BattleResultOutcome {
  const node = findNode(nodeId);
  if (!node || !node.encounter) throw new Error(`recordBattleResult: unknown or non-battle node "${nodeId}"`);
  const won = status === 'PLAYER_WIN';
  const progress = loadProgress();
  const ctx: ObjectiveContext = { stats, events, playerDeckFaction };

  const alreadyMet = new Set(progress.objectivesMet[nodeId] ?? []);
  const objectivesMet = node.encounter.objectives.map((def) => {
    const metThisRun = won && evaluateObjective(def, ctx);
    const newlyEarned = metThisRun && !alreadyMet.has(def.id);
    if (metThisRun) alreadyMet.add(def.id);
    return { id: def.id, text: def.text, met: alreadyMet.has(def.id), newlyEarned };
  });

  const wasCleared = isNodeCleared(nodeId, progress);
  const isFirstClear = won && !wasCleared;
  let cardGrant: GrantResult | null = null;

  if (won) {
    progress.objectivesMet[nodeId] = [...alreadyMet];
    if (!wasCleared) progress.clearedNodes = [...progress.clearedNodes, nodeId];
    // The unique first-clear card is granted exactly when the node flips to cleared (the same
    // firstClearClaimed bookkeeping the rest of Campaign uses) - a replay finds wasCleared true and grants nothing.
    const claimNew = isFirstClear && !progress.firstClearClaimed.includes(nodeId);
    if (claimNew) progress.firstClearClaimed = [...progress.firstClearClaimed, nodeId];
    saveProgress(progress);
    const cardId = node.encounter.firstClearReward.cardId;
    if (claimNew && cardId) cardGrant = grantCard(cardId, 1);
  }

  return {
    node,
    won,
    isFirstClear,
    objectivesMet,
    reward: won ? { firstClear: isFirstClear, def: isFirstClear ? node.encounter.firstClearReward : node.encounter.repeatReward } : null,
    cardGrant,
    chapterComplete: won && isChapterComplete(loadProgress()),
  };
}

/** Reward/story nodes have no battle - claiming/viewing them clears them directly. */
export function clearNonBattleNode(nodeId: string): { node: CampaignNodeDef; chapterComplete: boolean; cardGrant: GrantResult | null } {
  const node = findNode(nodeId);
  if (!node) throw new Error(`clearNonBattleNode: unknown node "${nodeId}"`);
  const progress = loadProgress();
  let cardGrant: GrantResult | null = null;
  if (!isNodeCleared(nodeId, progress)) {
    progress.clearedNodes = [...progress.clearedNodes, nodeId];
    const claimNew = !progress.firstClearClaimed.includes(nodeId);
    if (claimNew) progress.firstClearClaimed = [...progress.firstClearClaimed, nodeId];
    saveProgress(progress);
    if (claimNew && node.reward?.cardId) cardGrant = grantCard(node.reward.cardId, 1);
  }
  return { node, chapterComplete: isChapterComplete(loadProgress()), cardGrant };
}

export { STARTING_HP };
