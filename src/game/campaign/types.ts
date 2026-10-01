import type { Faction } from '../types';
import type { StarterFaction } from '../cards/starterDecks';

// Campaign vertical slice (see docs/game "Campaign Screen.dc.html" import). One real, playable region
// (Region 1 - "The Ashen Road", Chapter 1), everything past it a locked placeholder. Node content is
// data, not UI - adding Region 2 or Chapter 2 later is an entry in chapter1.ts/regions.ts, not a new
// screen (this is the design's own "Scaling" note, taken literally).

export type CampaignNodeType = 'story' | 'battle' | 'reward' | 'challenge' | 'elite' | 'boss';

/** A win-condition-adjacent bonus objective, checked from the real match's event log/stats - never a
 * separate mini-game. Only objectives that are honestly computable from what the engine already
 * reports are offered (see progress.ts's `OBJECTIVE_CHECKS`); "no giant tracking system" is a feature. */
export interface CampaignObjectiveDef {
  id: string;
  text: string;
  /** Key into OBJECTIVE_CHECKS (progress.ts) - kept as a lookup key, not a function, so node content
   * stays plain serializable data. */
  check: string;
  /** Threshold the check reads (a round count, a share of Starting HP in percent, a Clash Damage total). Omit for checks with no parameter. */
  value?: number;
}

export interface CampaignRewardDef {
  label: string;
  sub: string;
  icon: 'card' | 'ember' | 'emblem' | 'star';
  /** Set on card rewards: the real card id that is added to the player's collection (label is display text only). */
  cardId?: string;
  /** Copies granted (default 1). A stage can hand over the pair a starter deck needs in one go. */
  count?: number;
}

export type CampaignDifficulty = 'easy' | 'fair' | 'hard';

export interface CampaignEncounterDef {
  foeName: string;
  foeFaction: Faction;
  /** A real roster card id, used only for its portrait/art and faction tint on the stage sheet. */
  foeCardId: string;
  /** 1-5 pips, flavor-only difficulty signal - not read by the engine. */
  threat: number;
  energyCost: number;
  /** The actual enemy deck the battle engine plays against - always a real, validated deck. */
  enemyDeckFaction: StarterFaction;
  /**
   * The encounter's designed difficulty, shown on the stage sheet as Easy / Fair / Hard. Authored from simulation on
   * the production card resolver (scripts/simulate-modes.mjs: the card AI piloting the Kingdom starter at Mastery I wins
   * an Easy node about 80% of the time or more, a Fair one about 55-80%, a Hard one less). A description of the
   * encounter, not a prediction about the player's deck: one number can't capture deck synergy, so none is shown.
   */
  difficulty: CampaignDifficulty;
  /**
   * Boss HP pool: the enemy's Starting HP in place of its deck's own total (docs/CARD-COMBAT-DESIGN.md 12.7). A boss is
   * a player-like side with a large HP pool and a scripted deck; its Units still have no HP. Omit for a normal deck.
   */
  enemyStartingHp?: number;
  /** Challenge rule: the player starts at this percentage of their deck's Starting HP (a real mechanical effect). */
  playerStartingHpPct?: number;
  modifier?: { title: string; text: string };
  objectives: CampaignObjectiveDef[];
  firstClearReward: CampaignRewardDef;
  repeatReward: CampaignRewardDef;
}

export interface CampaignStoryBeatDef {
  speakerName: string;
  speakerFaction: Faction;
  speakerRole: string;
  lines: string[];
}

export interface CampaignNodeDef {
  id: string;
  type: CampaignNodeType;
  name: string;
  /** Short "what this node teaches" caption shown in the stage sheet - flavor/documentation only. */
  teach: string;
  /** Position along the chapter's painted road, in the design's own 0-1200 px coordinate space. */
  x: number;
  y: number;
  /** Node ids that must be cleared before this one unlocks. Empty for the chapter's first node. */
  requires: string[];
  /** True for the challenge spur - reachable once unlocked, but never required for later main-road nodes. */
  optional?: boolean;
  /** Present for battle/elite/boss/challenge nodes. */
  encounter?: CampaignEncounterDef;
  /** Present for story nodes. */
  story?: CampaignStoryBeatDef;
  /** Present for reward nodes (a claim, no battle). The final reward node also completes the chapter. */
  reward?: CampaignRewardDef;
  completesChapter?: boolean;
}

export interface CampaignChapterDef {
  id: string;
  regionId: string;
  name: string;
  meta: string;
  nodes: CampaignNodeDef[];
}

export interface CampaignRegionDef {
  id: string;
  name: string;
  blurb: string;
  faction: Faction;
  /** Only region 1 carries real chapters right now - see regions.ts. */
  chapters: CampaignChapterDef[];
  locked: boolean;
  requires?: string;
}
