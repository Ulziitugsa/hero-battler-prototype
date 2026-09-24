import { CARD_ASCENSIONS } from '../ascension/definitions';
import { getAscensionStatus } from '../ascension/ascend';
import { CHAPTER_1 } from '../campaign/chapter1';
import { findNode, getCurrentNodeId, isChapterComplete, isNodeCleared, type CampaignProgress } from '../campaign/progress';
import { findRegion } from '../campaign/regions';
import type { CampaignNodeType } from '../campaign/types';
import type { OwnedMap } from '../collection/types';
import { getStarterDeckUnlockProgress, starterDeckId, type StarterUnlockProgress } from '../collection/starterUnlock';
import type { StarterFaction } from '../cards/starterDecks';
import type { SummonHistoryEntry } from '../economy/types';
import { SUMMON_CONFIG } from '../summon/config';
import type { IdleRewardState } from '../campaign/idleRewards';

// Everything the Home hub shows that needs a DECISION (what is the next step, which single note is worth
// surfacing, which nav destinations deserve an attention dot) lives here as pure functions over real state,
// so the hierarchy is unit-tested and the components stay presentational. Nothing here mutates anything.

// ---- Campaign -------------------------------------------------------------------------------

export interface CampaignHub {
  status: 'fresh' | 'progress' | 'complete';
  /** "The Ashen Road" */
  region: string;
  /** "The Ashen Road · Chapter 1" */
  chapterLine: string;
  /** The next main-road node to play; null when the chapter is complete. */
  nextName: string | null;
  nextType: CampaignNodeType | null;
  /** Energy the next stage costs (0 for story/reward nodes); null when there is none. */
  energyCost: number | null;
  cleared: number;
  total: number;
}

export function campaignHub(progress: CampaignProgress): CampaignHub {
  const region = findRegion(CHAPTER_1.regionId);
  const regionName = region?.name ?? 'The Ashen Road';
  const chapterNumber = Math.max(1, (region?.chapters.findIndex((c) => c.id === CHAPTER_1.id) ?? 0) + 1);
  const cleared = CHAPTER_1.nodes.filter((n) => isNodeCleared(n.id, progress)).length;
  const nextId = getCurrentNodeId(progress);
  const next = nextId ? findNode(nextId) : undefined;
  const complete = isChapterComplete(progress);
  return {
    status: complete ? 'complete' : cleared === 0 ? 'fresh' : 'progress',
    region: regionName,
    chapterLine: `${regionName} · Chapter ${chapterNumber}`,
    nextName: complete ? null : (next?.name ?? null),
    nextType: complete ? null : (next?.type ?? null),
    energyCost: complete || !next ? null : (next.encounter?.energyCost ?? 0),
    cleared,
    total: CHAPTER_1.nodes.length,
  };
}

// ---- The one contextual note ------------------------------------------------------------------

export type HubNote =
  | { kind: 'idle'; gold: number; atCap: boolean }
  | { kind: 'mastery'; points: number }
  | { kind: 'starter'; deckId: string; name: string; collected: number; total: number }
  | { kind: 'recent'; cardId: string };

/** A locked starter counts as "close" from this fraction of its cards collected. */
export const STARTER_CLOSE_FRACTION = 0.4;
/** A first copy from Summon is "recent" for a day. */
export const RECENT_CARD_MS = 24 * 60 * 60 * 1000;
/** Below this, the idle note stays quiet rather than flickering on moments after a claim. */
export const IDLE_NOTE_MIN_GOLD = 20;

const STARTERS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];

/** The locked starter deck nearest to unlocking, if any is close enough to be worth a line on Home. */
export function closestStarter(owned: OwnedMap): StarterUnlockProgress | null {
  let best: StarterUnlockProgress | null = null;
  for (const f of STARTERS) {
    const p = getStarterDeckUnlockProgress(starterDeckId(f), owned);
    if (!p || p.unlocked || p.collected / p.total < STARTER_CLOSE_FRACTION) continue;
    if (!best || p.collected / p.total > best.collected / best.total) best = p;
  }
  return best;
}

/**
 * At most ONE note. Priority: a meaningful idle reward waiting to be claimed (it caps out and stalls if
 * ignored - the only one of these that actively decays), then an unspent Mastery Point (a decision
 * waiting for you, but one that never expires), then a starter deck that is close to unlocking, then a
 * card you just pulled for the first time. Nothing else earns a permanent place on Home.
 */
export function pickHubNote(input: { idle?: IdleRewardState; masteryPoints: number; owned: OwnedMap; history: readonly SummonHistoryEntry[]; now: number }): HubNote | null {
  if (input.idle && input.idle.availableGold >= IDLE_NOTE_MIN_GOLD) return { kind: 'idle', gold: input.idle.availableGold, atCap: input.idle.atCap };
  if (input.masteryPoints > 0) return { kind: 'mastery', points: input.masteryPoints };
  const starter = closestStarter(input.owned);
  if (starter) return { kind: 'starter', deckId: starter.deckId, name: starter.name, collected: starter.collected, total: starter.total };
  const latest = input.history[0];
  if (latest?.wasNew && input.now - latest.at < RECENT_CARD_MS) return { kind: 'recent', cardId: latest.cardId };
  return null;
}

// ---- Attention markers ------------------------------------------------------------------------

export interface AttentionState {
  /** Enough Gems for at least one summon. */
  canSummon: boolean;
  /** An unspent Mastery Point. */
  masteryPoint: boolean;
  /** Some card has a duplicate ready to Ascend. */
  ascensionReady: boolean;
}

export function anyAscensionReady(owned: OwnedMap): boolean {
  return CARD_ASCENSIONS.some((c) => getAscensionStatus(c.cardId, owned).canAscend);
}

export function attentionState(input: { gems: number; unlimitedGems?: boolean; masteryPoints: number; owned: OwnedMap }): AttentionState {
  return {
    canSummon: !!input.unlimitedGems || input.gems >= SUMMON_CONFIG.singleCost,
    masteryPoint: input.masteryPoints > 0,
    ascensionReady: anyAscensionReady(input.owned),
  };
}

/** Which bottom-nav destinations get a wax dot: only where something is genuinely waiting there. */
export function navDots(a: AttentionState): { heroes: boolean; profile: boolean } {
  return { heroes: a.ascensionReady, profile: a.masteryPoint };
}
