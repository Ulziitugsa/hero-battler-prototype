import type { Faction } from '../types/index.js';

// Mastery: the player's one equipped strategic passive. Pure data - the battle engine reads the
// per-rank parameters (engine/mastery.ts), the progression layer reads unlock levels and rank caps, the
// UI reads names and text. Nothing here has any behaviour of its own.
//
// Timing (engine/mastery.ts): a Mastery resolves at ONE fixed point - the start of a round, after both
// sides have drawn and before anyone deploys - on rounds that are an exact multiple of its interval
// ("every 3 rounds" = rounds 3, 6, 9...). That makes the cadence stateless (no counters to persist or
// desync) and completely predictable for the player.

export type MasteryId = 'necromancy' | 'fortification' | 'blood-pact';

export const MAX_MASTERY_RANK = 4;

export interface MasteryRankParams {
  /** Resolves on rounds divisible by this. */
  interval: number;
  /** How many Heroes it affects when it fires. */
  count: number;
  /** Necromancy: prefer this faction's Heroes when any are eligible. */
  preferFaction?: Faction;
  /** Fortification: prefer Heroes that don't already have a Shield. */
  preferUnshielded?: boolean;
}

export interface MasteryDef {
  id: MasteryId;
  name: string;
  /** One line on what the Mastery is about. */
  blurb: string;
  /** Account Level at which it unlocks (rank 1). */
  unlockLevel: number;
  /** False = defined so the UI can show what's coming, but not equippable and never resolved by the engine. */
  implemented: boolean;
  /** Index 0 = rank 1. */
  ranks: MasteryRankParams[];
}

export const MASTERIES: Record<MasteryId, MasteryDef> = {
  fortification: {
    id: 'fortification',
    name: 'Fortification',
    blurb: 'A defensive formation - your Heroes are shielded as the battle drags on.',
    unlockLevel: 1,
    implemented: true,
    ranks: [
      { interval: 4, count: 1 },
      { interval: 3, count: 1 },
      { interval: 3, count: 1, preferUnshielded: true },
      { interval: 3, count: 2, preferUnshielded: true },
    ],
  },
  necromancy: {
    id: 'necromancy',
    name: 'Necromancy',
    blurb: 'Graveyard recursion - your fallen Heroes keep coming back.',
    unlockLevel: 3,
    implemented: true,
    ranks: [
      { interval: 4, count: 1 },
      { interval: 3, count: 1 },
      { interval: 3, count: 1, preferFaction: 'undead' },
      { interval: 3, count: 2, preferFaction: 'undead' },
    ],
  },
  'blood-pact': {
    id: 'blood-pact',
    name: 'Blood Pact',
    blurb: 'Aggression at a price - pain makes your strongest Hero hit harder.',
    unlockLevel: 6,
    implemented: false,
    ranks: [{ interval: 1, count: 1 }],
  },
};

export const MASTERY_ORDER: MasteryId[] = ['fortification', 'necromancy', 'blood-pact'];

export function isMasteryId(id: unknown): id is MasteryId {
  return typeof id === 'string' && id in MASTERIES;
}

export function clampRank(id: MasteryId, rank: number): number {
  return Math.max(1, Math.min(MASTERIES[id].ranks.length, Math.floor(rank)));
}

export function getMasteryRankParams(id: MasteryId, rank: number): MasteryRankParams {
  return MASTERIES[id].ranks[clampRank(id, rank) - 1];
}

const ROMAN = ['I', 'II', 'III', 'IV'];
export const rankNumeral = (rank: number): string => ROMAN[rank - 1] ?? String(rank);

/** Concise player-facing effect text for a Mastery at a rank. Derived from the rank data so the text can never disagree with what the engine does. */
export function masteryEffectText(id: MasteryId, rank: number): string {
  const p = getMasteryRankParams(id, rank);
  const every = p.interval === 1 ? 'Every round' : `Every ${p.interval} rounds`;
  switch (id) {
    case 'necromancy': {
      const what = p.count > 1 ? `${p.count} Heroes` : 'a Hero';
      const pref = p.preferFaction ? `, Undead first` : '';
      return `${every}, return ${what} from your Graveyard to your hand${pref}.`;
    }
    case 'fortification': {
      const what = p.count > 1 ? `${p.count} allied Heroes` : 'an allied Hero';
      const pref = p.preferUnshielded ? ', unshielded first' : '';
      return `${every}, shield ${what}${pref}.`;
    }
    default:
      return 'After you take direct damage, your strongest Hero gains +1 Power this round.';
  }
}

/** What the next rank adds, in a few words - for the upgrade preview. null at max rank. */
export function masteryNextRankText(id: MasteryId, rank: number): string | null {
  if (rank >= MASTERIES[id].ranks.length) return null;
  const cur = getMasteryRankParams(id, rank);
  const next = getMasteryRankParams(id, rank + 1);
  const changes: string[] = [];
  if (next.interval !== cur.interval) changes.push(`triggers every ${next.interval} rounds`);
  if (next.count !== cur.count) changes.push(`affects ${next.count} Heroes`);
  if (next.preferFaction && next.preferFaction !== cur.preferFaction) changes.push('Undead Heroes come first');
  if (next.preferUnshielded && !cur.preferUnshielded) changes.push('prefers Heroes without a Shield');
  return changes.length ? changes.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : null;
}
