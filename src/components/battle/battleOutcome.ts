import type { GameEvent, GameState, Side } from '../../game/types';
import type { MissionDef } from '../../game/missions/definitions';
import type { MissionProgress } from '../../game/missions/store';
import type { XpGrantResult } from '../../game/progression/types';
import { MAX_LEVEL, xpToNextLevel } from '../../game/progression/config';
import { rankAt, RANKS } from '../../game/ranked/store';

// What the battle result screen says about the match it closes, read off data the game already has: the resolver's
// event log, the missions store before and after, the XP grant and the Ranked record. Pure - nothing here decides,
// grants or changes anything; it only turns those records into the few lines a player reads.

export type Outcome = 'victory' | 'defeat' | 'draw';

export function outcomeOf(status: GameState['status']): Outcome {
  return status === 'PLAYER_WIN' ? 'victory' : status === 'ENEMY_WIN' ? 'defeat' : 'draw';
}

export type FinishKind = 'direct' | 'clash' | 'effect';

/** The hit that ended the match: who dealt it, how, in which round, for how much. */
export interface FinishingBlow {
  /** The side whose HP reached 0. */
  side: Side;
  kind: FinishKind;
  /** The card that dealt it (the attacker, the lane's winner, or the effect's source). */
  source: string;
  /** Clash only: the Unit that lost the lane. */
  loser?: string;
  amount: number;
  round: number;
}

/**
 * The last damage the losing player took before the match ended. A draw (both sides fell, or the round limit) has no
 * single finishing blow, and neither does a log without one: both return null and the screen says nothing about it.
 */
export function finishingBlow(events: readonly GameEvent[], status: GameState['status']): FinishingBlow | null {
  const side: Side | null = status === 'PLAYER_WIN' ? 'enemy' : status === 'ENEMY_WIN' ? 'player' : null;
  if (!side) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    let blow: Omit<FinishingBlow, 'round'> | null = null;
    if (e.type === 'DIRECT_DAMAGE' && e.side === side && e.amount > 0) {
      // An unopposed attack logs its lane's COMBAT (PLAYER_DIRECT / ENEMY_DIRECT) right before the damage; any other
      // DIRECT_DAMAGE is a card effect hitting the player.
      const prev = events[i - 1];
      const unopposed = prev?.type === 'COMBAT' && (prev.outcome === 'PLAYER_DIRECT' || prev.outcome === 'ENEMY_DIRECT');
      blow = { side, kind: unopposed ? 'direct' : 'effect', source: e.sourceName, amount: e.amount };
    } else if (e.type === 'CLASH_DAMAGE' && e.side === side && e.amount > 0) {
      const combat = [...events.slice(0, i)].reverse().find((c) => c.type === 'COMBAT' && c.lane === e.lane);
      const names = combat?.type === 'COMBAT' ? { player: combat.player?.name, enemy: combat.enemy?.name } : { player: undefined, enemy: undefined };
      const winner = e.winner === 'tie' ? undefined : names[e.winner];
      if (winner) blow = { side, kind: 'clash', source: winner, loser: names[side], amount: e.amount };
    } else if (e.type === 'OVERFLOW_DAMAGE' && e.side === side && e.amount > 0) {
      blow = { side, kind: 'clash', source: e.winnerName, loser: e.loserName, amount: e.amount };
    }
    if (blow) {
      const round = [...events.slice(0, i)].reverse().find((r) => r.type === 'ROUND_START');
      return { ...blow, round: round?.type === 'ROUND_START' ? round.round : 1 };
    }
  }
  return null;
}

/** "Royal Guard's Direct Attack", "Bone Soldier won its lane against Light Priest", "Ember Hex". */
export function finishingBlowText(blow: FinishingBlow): string {
  if (blow.kind === 'direct') return `${blow.source}'s Direct Attack`;
  if (blow.kind === 'clash') return blow.loser ? `${blow.source} beat ${blow.loser} in a Clash` : `${blow.source} won a Clash`;
  return `${blow.source}'s effect`;
}

export interface MissionAdvance {
  id: string;
  title: string;
  /** Progress before this battle and after it (capped at the target). */
  from: number;
  count: number;
  target: number;
  /** This battle took it to its target. */
  completedNow: boolean;
}

type MissionRow = { def: MissionDef; progress: MissionProgress };

/**
 * The missions this battle moved forward, from the missions store read before the battle and after it. A mission that
 * was already complete, or claimed, before is not news; one that reset in between (a new day) is skipped rather than
 * shown going backwards.
 */
export function missionAdvances(before: readonly MissionRow[], after: readonly MissionRow[]): MissionAdvance[] {
  const was = new Map(before.map((m) => [m.def.id, m.progress]));
  const out: MissionAdvance[] = [];
  for (const { def, progress } of after) {
    const prev = was.get(def.id);
    const from = Math.min(def.target, prev?.count ?? 0);
    const to = Math.min(def.target, progress.count);
    if (!prev || prev.claimed || to <= from) continue;
    out.push({ id: def.id, title: def.title, from, count: to, target: def.target, completedNow: to >= def.target && from < def.target });
  }
  // Finished ones first: they are the ones with something to claim.
  return out.sort((a, b) => Number(b.completedNow) - Number(a.completedNow));
}

export interface XpBar {
  level: number;
  /** XP into `level` before and after this match, out of `max` (both equal `max` at the level cap). */
  from: number;
  to: number;
  max: number;
  levelUp: boolean;
}

/** The Account Level bar for the result screen: where the XP stood before this match and where it stands now. */
export function xpBar(xp: XpGrantResult): XpBar {
  const level = xp.levelAfter;
  if (level >= MAX_LEVEL) return { level, from: 1, to: 1, max: 1, levelUp: xp.levelsGained.length > 0 };
  const max = xpToNextLevel(level);
  const levelUp = xp.levelsGained.length > 0;
  // After a level-up the bar starts empty in the new level; otherwise it starts where this match's XP began.
  const from = levelUp ? 0 : Math.max(0, xp.xpAfter - xp.gained);
  return { level, from, to: xp.xpAfter, max, levelUp };
}

export interface RankedChange {
  before: number;
  after: number;
  delta: number;
  division: string;
  tier: string;
  /** Share of the way through the current division, 0-100, before this match (0 after a promotion, 100 after a demotion) and now. */
  fromProgress: number;
  progress: number;
  /** Rating points to the next division, or null at the top. */
  toNext: number | null;
  nextDivision: string | null;
  /** The division changed with this match. */
  promoted: boolean;
  demoted: boolean;
  /** A Division reward became claimable with this match. */
  rewardReady: boolean;
}

export function rankedChange(before: number, after: number, rewardReady: boolean): RankedChange {
  const was = rankAt(before);
  const now = rankAt(after);
  const moved = RANKS.indexOf(now.division) - RANKS.indexOf(was.division);
  return {
    before,
    after,
    delta: after - before,
    division: now.division,
    tier: now.tier,
    fromProgress: moved > 0 ? 0 : moved < 0 ? 100 : was.progress,
    progress: now.progress,
    toNext: now.next === null ? null : now.next - after,
    nextDivision: now.next === null ? null : rankAt(now.next).division,
    promoted: moved > 0,
    demoted: moved < 0,
    rewardReady,
  };
}
