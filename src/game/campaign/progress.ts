import type { GameEvent, GameState } from '../types';
import type { MatchStats } from '../engine/stats';
import { STARTING_HP } from '../engine/constants';
import type { CampaignNodeDef, CampaignObjectiveDef, CampaignRewardDef } from './types';
import { CHAPTER_1 } from './chapter1';
import { getCollection, grantCard } from '../collection/collection';
import type { GrantResult } from '../collection/types';
import { getStarterProgressUpdate, type StarterProgressUpdate } from '../collection/starterUnlock';
import { grantCampaignXp } from '../progression/rewards';
import type { XpGrantResult } from '../progression/types';
import { grantGems, grantGold } from '../economy/economy';
import { campaignFirstClearGems, campaignWinGold, chapterCompleteGems } from '../economy/rewards';
import { track } from '../../analytics/track';
import { getActiveDeck } from '../engine/activeDeck';
import { getAccount } from '../progression/account';
import { getHeroLevelState } from '../heroLevel/store';
import { getAscensionState } from '../ascension/store';
import { rosterPowerForDeck } from '../heroLevel/rosterPower';
import { getConfig } from '../../config/config';

// Campaign node-clearing progress. localStorage-only, following the same convention as
// localDecks.ts/preferences.ts (try/catch-wrapped, sane defaults, never throws).

const STORAGE_KEY = 'skyloom:campaignProgress';

export interface CampaignProgress {
  clearedNodes: string[];
  /** Best-ever objective ids earned per node - a seal, once pressed, stays pressed even if a later replay misses it. */
  objectivesMet: Record<string, string[]>;
  firstClearClaimed: string[];
  /**
   * Commercial Prototype Phase 3 - the player's Roster Power at the moment of a LOSS on a node whose
   * current Roster Power sat below its `recommendedRosterPower`. Kept only until the next win on that
   * node (consumed then, whether or not Power actually rose) - this is a short-lived "was the player
   * behind last time" flag for the campaign_upgrade_after_loss / campaign_return_win analytics, not a
   * permanent record.
   */
  lastLossPower: Record<string, number>;
}

function defaultProgress(): CampaignProgress {
  return { clearedNodes: [], objectivesMet: {}, firstClearClaimed: [], lastLossPower: {} };
}

export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<CampaignProgress>;
    return {
      clearedNodes: parsed.clearedNodes ?? [],
      objectivesMet: parsed.objectivesMet ?? {},
      firstClearClaimed: parsed.firstClearClaimed ?? [],
      lastLossPower: parsed.lastLossPower && typeof parsed.lastLossPower === 'object' ? parsed.lastLossPower : {},
    };
  } catch {
    return defaultProgress();
  }
}

/** The active deck's current Roster Power, read fresh - see game/heroLevel/rosterPower.ts. Only meaningful for battle/challenge/elite/boss nodes. */
function currentRosterPower(): number {
  return rosterPowerForDeck(getActiveDeck().cardIds, getAccount().level, getHeroLevelState(), getAscensionState());
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

/** A node's recommended Roster Power (Commercial Prototype Phase 3), with a Phase 8 remote-config override
 * checked first - see config/schema.ts's CampaignConfig.recommendedPowerOverrides header note on why this
 * is an override map rather than moving the node's own authored value into config. Undefined when the
 * node has no encounter or no recommendation at all (story/reward nodes). */
export function recommendedPowerFor(node: CampaignNodeDef): number | undefined {
  return getConfig().campaign.recommendedPowerOverrides[node.id] ?? node.encounter?.recommendedRosterPower;
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
  /** How that card moved a still-locked starter deck toward (or into) being unlocked. */
  starterProgress: StarterProgressUpdate | null;
  /** Account XP this result granted (win, replay win or loss); null for a claim that has no fight. */
  xp: XpGrantResult | null;
  /** Gems this result granted: the node's first-clear Gems plus the chapter bonus when this clear completed the chapter. 0 for replays and losses. */
  gems: number;
  /** Gold this result granted - unlike Gems, every win pays Gold, not just the first clear. 0 for a loss. */
  gold: number;
  chapterComplete: boolean;
}

/** Adds a reward's card(s) to the collection and reports how it moved any starter deck. Shared by battle and reward-node claims. */
function grantReward(def: CampaignRewardDef): { cardGrant: GrantResult | null; starterProgress: StarterProgressUpdate | null } {
  if (!def.cardId) return { cardGrant: null, starterProgress: null };
  const before = getCollection();
  const cardGrant = grantCard(def.cardId, def.count ?? 1);
  const starterProgress = cardGrant ? getStarterProgressUpdate(def.cardId, before, getCollection()) : null;
  return { cardGrant, starterProgress };
}

/** Grants first-clear Gems (when this is the node's first claim) and the chapter bonus (when this claim flipped the chapter to complete), once, in one grant. */
function grantCampaignGems(node: CampaignNodeDef, firstClaim: boolean, chapterWasComplete: boolean, chapterIsComplete: boolean): number {
  const total = (firstClaim ? campaignFirstClearGems(node.type) : 0) + (!chapterWasComplete && chapterIsComplete ? chapterCompleteGems() : 0);
  return total > 0 ? grantGems(total, 'campaign').gained : 0;
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
  const chapterWasComplete = isChapterComplete(progress);
  const isFirstClear = won && !wasCleared;
  let granted: ReturnType<typeof grantReward> = { cardGrant: null, starterProgress: null };
  let gems = 0;
  let gold = 0;

  // Commercial Prototype Phase 3: was the player under the node's recommended Roster Power for this
  // attempt? Computed once and reused by both the loss-tracking and the win/return-win branches below.
  const recommended = recommendedPowerFor(node);
  const power = recommended !== undefined ? currentRosterPower() : null;
  const wasBehind = power !== null && recommended !== undefined && power < recommended;

  if (won) {
    progress.objectivesMet[nodeId] = [...alreadyMet];
    if (!wasCleared) progress.clearedNodes = [...progress.clearedNodes, nodeId];
    // The unique first-clear card is granted exactly when the node flips to cleared (the same
    // firstClearClaimed bookkeeping the rest of Campaign uses) - a replay finds wasCleared true and grants nothing.
    const claimNew = isFirstClear && !progress.firstClearClaimed.includes(nodeId);
    if (claimNew) progress.firstClearClaimed = [...progress.firstClearClaimed, nodeId];
    // A previous loss on this node recorded a Power deficit - consumed on the next win regardless of
    // outcome, so it can never linger and misfire on some unrelated later win.
    const lossPower = progress.lastLossPower[nodeId];
    if (lossPower !== undefined) {
      const rest = { ...progress.lastLossPower };
      delete rest[nodeId];
      progress.lastLossPower = rest;
      if (power !== null && power > lossPower) {
        track('campaign_upgrade_after_loss', { nodeId, lossPower, winPower: power, powerGain: power - lossPower });
        track('campaign_return_win', { nodeId, lossPower, winPower: power });
      }
    }
    saveProgress(progress);
    if (claimNew) granted = grantReward(node.encounter.firstClearReward);
    gems = grantCampaignGems(node, claimNew, chapterWasComplete, isChapterComplete(progress));
    // Unlike Gems, Gold pays out on EVERY win, cleared or not - it's the always-available reason to
    // keep replaying a finished chapter (see docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 1).
    const goldAmount = campaignWinGold(node.type);
    gold = goldAmount > 0 ? grantGold(goldAmount, 'campaign').gained : 0;
  } else if (wasBehind && power !== null) {
    progress.lastLossPower = { ...progress.lastLossPower, [nodeId]: power };
    saveProgress(progress);
    track('campaign_loss_at_power_deficit', { nodeId, nodeType: node.type, currentPower: power, recommended: recommended ?? 0, deficit: (recommended ?? 0) - power });
  }

  track(won ? 'campaign_won' : 'campaign_lost', { nodeId, nodeType: node.type, isFirstClear, roundsPlayed: stats.roundsPlayed, finalPlayerHp: stats.finalPlayerHp, rosterPower: power ?? undefined });

  return {
    node,
    won,
    isFirstClear,
    objectivesMet,
    reward: won ? { firstClear: isFirstClear, def: isFirstClear ? node.encounter.firstClearReward : node.encounter.repeatReward } : null,
    cardGrant: granted.cardGrant,
    starterProgress: granted.starterProgress,
    xp: grantCampaignXp(node.type, { won, isFirstClear }),
    gems,
    gold,
    chapterComplete: won && isChapterComplete(loadProgress()),
  };
}

/** Reward/story nodes have no battle - claiming/viewing them clears them directly. */
export function clearNonBattleNode(nodeId: string): { node: CampaignNodeDef; chapterComplete: boolean; cardGrant: GrantResult | null; starterProgress: StarterProgressUpdate | null; gems: number } {
  const node = findNode(nodeId);
  if (!node) throw new Error(`clearNonBattleNode: unknown node "${nodeId}"`);
  const progress = loadProgress();
  let granted: ReturnType<typeof grantReward> = { cardGrant: null, starterProgress: null };
  let gems = 0;
  const chapterWasComplete = isChapterComplete(progress);
  if (!isNodeCleared(nodeId, progress)) {
    progress.clearedNodes = [...progress.clearedNodes, nodeId];
    const claimNew = !progress.firstClearClaimed.includes(nodeId);
    if (claimNew) progress.firstClearClaimed = [...progress.firstClearClaimed, nodeId];
    saveProgress(progress);
    if (claimNew && node.reward) granted = grantReward(node.reward);
    gems = grantCampaignGems(node, claimNew, chapterWasComplete, isChapterComplete(progress));
  }
  return { node, chapterComplete: isChapterComplete(loadProgress()), ...granted, gems };
}

export { STARTING_HP };
